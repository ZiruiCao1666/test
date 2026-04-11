import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../db.js'

const DB_INIT_LOCK_KEY_1 = 54100
const DB_INIT_LOCK_KEY_2 = 1

const currentFilePath = fileURLToPath(import.meta.url)
const currentDir = path.dirname(currentFilePath)

function resolveSqlFile(name) {
  return path.join(currentDir, '..', 'sql', name)
}

async function readSqlFile(name) {
  return fs.readFile(resolveSqlFile(name), 'utf8')
}

async function assertRewardsTitleUnique(client) {
  const result = await client.query(
    `
    SELECT (
      EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
         AND kcu.constraint_schema = tc.constraint_schema
        WHERE tc.table_schema = current_schema()
          AND tc.table_name = 'app_rewards'
          AND tc.constraint_type = 'UNIQUE'
        GROUP BY tc.constraint_name
        HAVING COUNT(*) = 1
           AND MIN(kcu.column_name) = 'title'
           AND MAX(kcu.column_name) = 'title'
      )
      OR EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'app_rewards'
          AND regexp_replace(indexdef, '\\s+', ' ', 'g')
            ~* 'CREATE UNIQUE INDEX .* ON .*app_rewards .* \\(title\\)$'
      )
    ) AS has_unique_title
    `,
  )

  if (result.rows[0] && result.rows[0].has_unique_title) {
    return
  }

  throw new Error(
    'app_rewards(title) must have a UNIQUE constraint or UNIQUE index before seed upsert can run.',
  )
}

export async function runDbInit() {
  const schemaSql = await readSqlFile('schema.sql')
  const seedSql = await readSqlFile('seed.sql')
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [
      DB_INIT_LOCK_KEY_1,
      DB_INIT_LOCK_KEY_2,
    ])
    await client.query(schemaSql)
    await assertRewardsTitleUnique(client)
    await client.query(seedSql)
    await client.query('COMMIT')
    console.log('[DB] db init completed')
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (_rollbackError) {
      // Ignore rollback failures so the original init error is preserved.
    }
    console.error('[DB] db init failed:', error)
    throw error
  } finally {
    client.release()
  }
}

const isDirectRun =
  process.argv[1] && currentFilePath === path.resolve(process.argv[1])

if (isDirectRun) {
  runDbInit()
    .then(async function () {
      await pool.end()
      process.exit(0)
    })
    .catch(async function () {
      await pool.end()
      process.exit(1)
    })
}
