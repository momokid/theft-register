# CLAUDE.md — Theft Register

Read this first, every session. Then read **CONTEXT.md** (why and what) and **REFERENCE.md** (exact schema, API, and rules). If these files conflict, REFERENCE.md wins on technical detail and CONTEXT.md wins on business meaning. Ask me about any conflict you can't resolve.

## Working agreement
- **Plan before code.** At the start of each phase, state what you will change (files, functions, SQL) in a few lines. Wait for my "go".
- **One phase at a time** (phases are in REFERENCE.md §12). Stop at the end of each phase with: what changed, how you tested it, and any open questions.
- **Never guess a business rule.** If REFERENCE.md doesn't cover it, ask.
- **No new dependencies** beyond REFERENCE.md §2 without asking. Justify any addition in one line.
- **Keep it small.** Prefer the standard library and simple functions over abstractions. No speculative features.
- **Comments:** only where the *why* isn't obvious. No verbose or narrating comments.
- Explain things to me in simple, brief English.

## Commands
```
npm install
npm run dev          # server (nodemon-free: node --watch) + Vite dev server with /api proxy
npm run build        # builds client → client/dist
npm start            # production server (Passenger uses app.js)
npm run migrate      # applies pending migrations
npm run create-user -- --name "X" --email x@y.com [--admin]
npm test             # node:test integration tests against a test DB
```

## Security rules (non-negotiable)
1. **SQL:** parameterised queries only (`?` placeholders). Never interpolate user input. Filter and sort fields go through a whitelist map.
2. **AuthN:** bcryptjs cost 12. JWT in an httpOnly cookie, `sameSite=lax`, `secure` in production, 8-hour expiry. `JWT_SECRET` comes from env only. The app refuses to start if it's missing or shorter than 32 characters.
3. **Login:** the same generic error for a wrong email or a wrong password. Run a bcrypt compare against a dummy hash when the email doesn't exist, so response timing doesn't reveal valid emails. Rate limit: 5 per 15 minutes per IP.
4. **AuthZ on the server, every request.** The auth middleware loads the user from the DB, so inactive means 401. `requireAdmin` returns 403. Hiding buttons is not security.
5. **CSRF:** the API accepts JSON (or multipart for import) only. State-changing requests must carry an `Origin` header matching `APP_ORIGIN`; otherwise 403.
6. **Validation:** validate every body, query, and param at the route edge (`server/validate.js`, hand-written, no library). Reject unknown fields. Dates are `YYYY-MM-DD`. Prices are ≥ 0 with at most 2 decimals.
7. **Uploads:** multer memory storage, 10 MB max, one file. Accept `.xlsx` only: check the extension **and** the ZIP magic bytes `PK\x03\x04`. Cap at 10,000 data rows. Parse inside try/catch and return a 400 with a clear message.
8. **Output:**
   - React escapes output. **Never** use `dangerouslySetInnerHTML`; raw_post is rendered as text with `white-space: pre-wrap`.
   - In exports, write all text as plain string cells, never as formulas.
9. **Errors:** a central error handler. The client gets `{error}` only, with no stack traces or SQL messages. Log server-side without secrets, passwords, hashes, or cookies.
10. **Headers:** helmet with a strict CSP (`default-src 'self'`; no inline scripts; styles `'self'`). `app.disable('x-powered-by')`. `app.set('trust proxy', 1)` for cPanel, so rate limiting sees the real IP.
11. **Audit log is append-only.** No update or delete code paths. A price write and its audit row go in **one transaction**.
12. **Secrets:** `.env` is git-ignored. Commit `.env.example` only.
13. Run `npm audit` at the end of each phase and report any high or critical findings.

## Efficiency rules
- **mysql2 pool:** `connectionLimit: 5` (shared hosting), `dateStrings: true` (stops timezone shifts on DATE columns), `decimalNumbers: true`.
- Totals, subtotals, and summaries are computed **in SQL**, never by pulling rows into JS to add them up.
- List endpoints are paginated (default 50, max 100). `all=1` is only for print and export, capped at 5,000.
- **raw_post** is never selected in list queries, only in `GET /api/thefts/:id` and the export.
- Build every filtered query with one shared function, so the table, the summary, the export, and the print report always use identical WHERE logic.
- No N+1 queries. Use the existing indexes (post_date, site_id, item_type), and add an index only with justification.
- Client: one fetch helper (credentials, JSON, error handling, a 401 sends you to login). Refetch only what changed. Debounce filter inputs by 300 ms. Abort in-flight requests when filters change.
- Use `compression` middleware for API and static responses.

## Code style
- Node ≥ 18, ES modules, async/await, `const` by default.
- Small route files. SQL lives in route or service files as named constants, not scattered inline.
- Money: compute in SQL as DECIMAL. Format on the client with `Intl.NumberFormat('en-GH', {minimumFractionDigits: 2})` and prefix with `GHS`.
- Display dates as DD/MM/YYYY. Send dates to and from the API as YYYY-MM-DD.
- CSS variables for theming. `[data-theme="dark"]` on `<html>`.

## Definition of done (per phase)
- The phase's acceptance checks from REFERENCE.md §13 pass. Show me how you verified them.
- There are integration tests (`node:test` + built-in `fetch`) for the new endpoints, including the 401, 403, and 400 cases.
- No console errors in the browser. `npm run build` succeeds.
- `npm audit` shows no high or critical issues, or you've explained them.