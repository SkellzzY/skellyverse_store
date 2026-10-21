# Skellyverse

Artist site for SKELLY, live at https://skellyverse.store.

## Stack
- Node >= 22.13 (uses built-in `node:sqlite`), Express 4, multer, dotenv. No build step.
- `server.js`: API, admin routes, uploads, security headers.
- `accounts.js`: user accounts at `/api/account` (signup, login, logout, me, password). scrypt hashes, sha256-hashed session tokens in an httpOnly cookie, rate limits, JSON-only POSTs.
- `public/index.html`: homepage (Three.js r128 from cdnjs). 19 color themes, switching every 6 hours (`?theme=N` previews one).
- `public/admin.html`: admin panel at `/admin`, guarded by the `ADMIN_PASSWORD` env var (must be 12+ characters).
- `public/account.js`: the LOG IN button and modal (`window.SkellyAccount`, fires `skelly:account`).

## Data
Everything that must survive a redeploy lives in `DATA_DIR` (default `./data`, gitignored): `tracks.json`, `uploads/`, `skellyverse.db`.

## Hosting
- Railway project `skellyverse_store` deploys automatically on every push to `main` of github.com/SkellzzY/skellyverse_store.
- A Volume is mounted at `/data`.
- Variables: `NODE_ENV=production`, `DATA_DIR=/data`, `ADMIN_PASSWORD`. Spotify keys are not set yet.
- DNS is at Namecheap: ALIAS `@` points to the Railway domain, plus a `_railway-verify` TXT record.

## Rules
- The repo is public. Never commit secrets, `.env`, PDFs or `WHERE-EVERYTHING-IS.md` (private notes, gitignored).
- Never connect to the old server at 209.74.95.215. That IP now belongs to someone else.
- Run locally with `npm run dev`, then check http://localhost:3000.

## Open items
- Spotify: rotate the client secret, then add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in Railway. Until then the admin FETCH button fails, and MANUAL mode with a Spotify link works.
- `favicon.png` is missing.
- Accounts have no forgot-password or email verification yet. Both need an email service such as Resend.
- Decide what accounts are for: favorites, comments, early access, a merch store, etc.
- Consider making the GitHub repo private.
