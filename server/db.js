import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

// 参考 Neon 官方连接文档：https://neon.com/docs/connect/connect-securely
// 官方推荐直接使用 Neon 提供的 DATABASE_URL；连接串里自带 sslmode=require。
// 这里不再额外传 ssl 对象，避免和连接串里的 SSL 参数混用。
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})
