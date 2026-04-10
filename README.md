# Student Motivation App

Student Motivation is an Expo app with an Express API and a Postgres database. The project uses Clerk for authentication and keeps Canvas access on the server side.

## Stack

- Node.js `>=20.19.4`
- Expo `~54.0.33`
- Expo Router `~6.0.23`
- React Native `0.81.5`
- React `19.1.0`
- Clerk Expo `^2.19.11`
- Clerk Express `^1.7.4`
- Express `^4.21.2`
- pg `^8.13.1`

## Project Structure

- `client/`: Expo app
- `server/`: Express API server
- `server/sql/`: SQL reference files

## Quick Start

### 1. Create local environment files

Copy the example files and fill in your own values:

```bash
copy client\\.env.example client\\.env
copy server\\.env.example server\\.env
```

### 2. Configure the backend

`server/.env` should contain:

```env
DATABASE_URL=
CLERK_SECRET_KEY=
CANVAS_TOKEN_SECRET=
PORT=10000
```

Notes:

- `DATABASE_URL` is your Neon/Postgres connection string.
- `CLERK_SECRET_KEY` must stay on the server only.
- `CANVAS_TOKEN_SECRET` is used to encrypt saved Canvas tokens.
- `PORT` defaults to `10000` if you leave it empty.

### 3. Configure the Expo app

`client/.env` should contain:

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=
EXPO_PUBLIC_API_URL=http://localhost:10000
```

Notes:

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is the Clerk publishable key for the Expo app.
- `EXPO_PUBLIC_API_URL` is the base URL for the Express API.
- Only `EXPO_PUBLIC_*` variables are available inside Expo app code.
- Do not put secrets such as `DATABASE_URL` or `CLERK_SECRET_KEY` in `client/.env`.

### 4. Start the backend

```bash
cd server
npm install
npm run dev
```

The API runs at `http://localhost:10000` unless `PORT` is overridden.

### 5. Start the Expo app

```bash
cd client
npm install
npm run start
```

## Real Device Note

If you run Expo on a real phone, `localhost` usually points to the phone itself, not your computer.

- Keep your phone and computer on the same Wi-Fi.
- Replace `EXPO_PUBLIC_API_URL` with your computer's LAN IP when testing on a device, for example `http://192.168.1.20:10000`.
- If LAN access is not working, Expo tunnel can help during development.

## Main Features

- Clerk sign in and sign up
- Daily check-in and points
- Reward catalog and redemption history
- Canvas account connection and data sync
- User profile sync to backend

## Main API Routes

- `GET /health`
- `POST /users/sync`
- `GET /checkins/status`
- `POST /checkins/today`
- `PUT /checkins/today-note`
- `GET /rewards/catalog`
- `POST /rewards/redeem`
- `GET /rewards/orders`
- `GET /canvas/credentials`
- `PUT /canvas/credentials`
- `GET /canvas/snapshot`
- `GET /canvas/submissions/:courseId/:assignmentId`
- `DELETE /canvas/credentials`

## Official References

- Expo docs: <https://docs.expo.dev/>
- Expo environment variables: <https://docs.expo.dev/guides/environment-variables/>
- Expo CLI and tunnel: <https://docs.expo.dev/more/expo-cli/>
- Expo app config: <https://docs.expo.dev/versions/latest/config/app/>
- Clerk Expo quickstart: <https://clerk.com/docs/expo/getting-started/quickstart>
- Clerk Express middleware: <https://clerk.com/docs/reference/express/clerk-middleware>
- Clerk Express `getAuth()`: <https://clerk.com/docs/reference/express/get-auth>
- Neon connection guide: <https://neon.com/docs/get-started/connect-neon>
- Canvas developer docs: <https://developerdocs.instructure.com/services/canvas>

## Notes

- Files with the `.txt` extension are historical backup files. They are kept on purpose and are not part of the running app.
- Keep `.env` files out of version control. This repo includes `.env.example` templates instead.
- Because `.env` files were previously tracked, treat old `DATABASE_URL`, `CLERK_SECRET_KEY`, and `CANVAS_TOKEN_SECRET` values as exposed and rotate them outside the repo.
