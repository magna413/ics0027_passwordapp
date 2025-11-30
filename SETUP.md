# Setup and Usage Guide

## Prerequisites
- Node.js 18+ and npm 9+
- SQLite (dev) or PostgreSQL (prod)

## Installation
1) Install dependencies:
```bash
npm install
```
2) Copy environment file and fill in required secrets. Prisma reads `.env` by default:
```bash
cp .env.example .env
```

3) Generate OPAQUE server setup (required for authentication):
```bash
node -e "const opaque = require('@serenity-kit/opaque'); opaque.ready.then(() => { const setup = opaque.server.createSetup();
  console.log(setup); }).catch(console.error);"
```
Copy the base64 output and set `OPAQUE_SERVER_SETUP` in your `.env` file.

4) Generate NextAuth secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output and set `NEXTAUTH_SECRET` in your `.env` file.

5) Fill in remaining environment variables:
- `DATABASE_URL`: Your SQLite or PostgreSQL connection string
- `NEXTAUTH_URL`: Your application's public URL (e.g., http://localhost:3000)

6) Apply database schema:
```bash
npx prisma migrate dev
```

7) Optional: Inspect DB locally:
```bash
npx prisma studio
```
> Tip: Use `npx prisma migrate reset` only in development; it wipes data.

## Running
- Development:
```bash
npm run dev
# open http://localhost:3000
```
- Production build:
```bash
npm run build
npm run start
```

## Usage
1) Register (OPAQUE protects the master password; master key never leaves the browser).
2) Optionally enable TOTP MFA.
3) Add/retrieve/delete credentials in the dashboard; vault stays encrypted client-side with AES-GCM.
4) Sessions use secure cookies; CSRF tokens are required on state-changing actions.
