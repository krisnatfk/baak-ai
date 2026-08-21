# AI PMB — Run doc

## Reproduce uncommitted artifacts

This worktree is the same directory as the main checkout; no copying needed.

- `.env` — already present at the repo root (24 keys: `DATABASE_URL`, `AUTH_SECRET`, `INTERNAL_API_KEY`, embedding/LLM config, etc.). No `.env.local` is used. If a fresh checkout is missing `.env`, copy it from the main checkout.
- Dependencies — installed via `npm install` (see `package-lock.json`). Reproduce with:
  ```
  npm install --no-audit --no-fund
  ```
- Database — `DATABASE_URL` points to PostgreSQL. The app needs a reachable DB for authenticated pages; the login page itself renders without it. If the DB is down, run `npm run db:migrate` after starting Postgres.

## Run the dev server

Default dev script binds port 3001 (Next.js):

```
npm run dev
```

Detached (Windows) — start with PowerShell and capture the pid:

```
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev' -RedirectStandardOutput '<log>' -RedirectStandardError '<log>.err' -WindowStyle Hidden -PassThru).Id"
```

stdout and stderr must go to DIFFERENT files (PowerShell restriction).

Health check: `http://localhost:3001` answers HTTP after Next.js finishes compiling.

## Notes

- `.freebuff/preview-*.log` holds server output for the Preview tab.
- If port 3001 is busy, pass a free port: `npm run dev -- --port <port>`.
