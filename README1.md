# Student Motivation App

A student motivation app built with Expo Router, Clerk, Express, and Postgres.

## Stack

- Node.js `v20.19.4`
- Expo `~54.0.33`
- Expo Router `~6.0.23`
- React Native `0.81.5`
- React `19.1.0`
- Clerk Expo `^2.19.11`
- Express `^4.21.2`
- pg `^8.13.1`

## Quick Install

Install Node.js first:

- Official download: <https://nodejs.org/en/download>

Install backend dependencies:

```bash
cd server
npm install
```

Install client dependencies:

```bash
cd client
npm install
```

If you want the package install commands for this stack from scratch, the main ones are:

```bash
cd client
npx expo install expo-router expo-secure-store expo-web-browser expo-linking expo-constants expo-status-bar react-native-safe-area-context react-native-screens
npm install @clerk/clerk-expo
```

```bash
cd server
npm install @clerk/express cors dotenv express pg
```

## Project Structure

- `client/`: Expo app
- `server/`: Express API server
- `server/sql/`: SQL reference files

## Features

- Clerk sign in / sign up
- Daily check-in and points
- Reward catalog and redemption history
- Canvas account connection and data sync
- User profile sync to backend

## Environment Variables

### `server/.env`

Set these values before starting the backend:

```env
DATABASE_URL=your_postgres_connection_string
CLERK_SECRET_KEY=your_clerk_secret_key
PORT=10000
CANVAS_TOKEN_SECRET=your_canvas_token_secret
```

Notes:

- `PORT` defaults to `10000` if not set
- `CANVAS_TOKEN_SECRET` is required for Canvas token encryption
- `CLERK_PUBLISHABLE_KEY` may exist in your local env, but the current server code does not depend on it directly

### `client/.env`

Set these values before starting the Expo app:

```env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
EXPO_PUBLIC_API_URL=http://localhost:10000
```

Notes:

- The client code reads `EXPO_PUBLIC_API_URL`
- The client code also reads `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- Do not put server secrets in `client/.env`
- If you run Expo on a real phone, do not use `localhost`
- For a real device, use your computer LAN IP, for example:
  `EXPO_PUBLIC_API_URL=http://192.168.1.20:10000`
- For Android emulator, you may need:
  `EXPO_PUBLIC_API_URL=http://10.0.2.2:10000`

## Install

### Backend

```bash
cd server
npm install
npm run dev
```

The backend will run on:

```txt
http://localhost:10000
```

unless you override `PORT` in `server/.env`.

### Client

```bash
cd client
npm install
npm run start
```

Then open the Expo app and run on web, emulator, or device.

## Official Docs

- Expo: <https://docs.expo.dev/>
- Expo Router: <https://docs.expo.dev/router/installation/>
- Expo env vars: <https://docs.expo.dev/guides/environment-variables/>
- Clerk Expo: <https://clerk.com/docs/expo/getting-started/quickstart>
- Clerk Express: <https://clerk.com/docs/expressjs/getting-started/quickstart>
- node-postgres: <https://node-postgres.com/features/connecting>

## Auth and Routing

Main route groups:

- `(auth)`: sign-in and sign-up pages
- `(home)`: authenticated app pages

Important screens:

- `/sign-in`
- `/sign-up`
- `/`
- `/calendar`
- `/rewards`
- `/orders`
- `/my-profile`
- `/sso-callback`

## Backend API

Main endpoints used by the client:

- `GET /health`
- `POST /users/sync`
- `GET /checkins/status`
- `POST /checkins/today`
- `GET /rewards/catalog`
- `POST /rewards/redeem`
- `GET /rewards/orders`
- `GET /canvas/credentials`
- `PUT /canvas/credentials`
- `DELETE /canvas/credentials`

## Notes

- The Expo app uses the scheme `studentmotivation`
- SSO callback route is `/sso-callback`
- Canvas credentials are encrypted on the server before storage
- Clerk auth is required for protected app routes and backend API access
