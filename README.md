# Theft Register

Node/Express + React app for RH Security Ltd to track and price theft losses at telecom tower sites (HTG, ATC).

## Stack

Node.js (Express API) + React (Vite) SPA, MySQL/MariaDB, hosted on cPanel via Passenger.

## Local development

```bash
npm install
cp .env.example .env       # fill in DB credentials and a JWT_SECRET (≥ 32 random chars)
mysql -u <user> -p <database> < schema.sql   # first time only — creates the base tables
npm run migrate                              # applies migrations/*.sql
npm run create-user -- --name "Your Name" --email you@example.com --admin
npm run dev                                  # server + Vite dev server with /api proxy
```

`npm run migrate` only tracks and applies files under `migrations/` — it doesn't create the base tables, so `schema.sql` must be loaded once by hand first, as shown above.

## Testing

`npm test` runs the full suite locally, including `thefts`/`prices`/`quantity`/`export` tests that assert against the real historical dataset (172 rows). That data isn't checked into git (it's real theft/loss records), so it has to be imported once by hand — either via the app's own Import tab, or by loading a local data dump directly into `theft_register_test`.

GitHub Actions CI (`.github/workflows/ci.yml`) runs on every push/PR against a disposable MariaDB service, but only the test files that seed their own rows (`auth`, `accounts`, `audit`, `import`) — it has no access to the real dataset, so the data-dependent tests stay a local/manual check before deploying.

## Deploying to cPanel

1. **Build locally.**

   ```bash
   npm install
   npm run build
   ```

   This produces `client/dist`, which the server serves as static files in production — cPanel does not need to run the Vite build.

2. **Upload the app.** Two options:
   - **cPanel Git Version Control (recommended, enables one-click redeploys):** cPanel → *Git™ Version Control* → *Create* → point it at this repo's GitHub URL, and set the repository path to the same directory you'll use as the Node.js app's application root (e.g. `~/theft-register`). cPanel clones the repo there.
   - **Manual:** upload the whole project (excluding `node_modules` and `.env`) via File Manager or SFTP/rsync.

3. **Create the Node.js app in cPanel.** cPanel → *Setup Node.js App* → Create Application:
   - Node version: 18 or later.
   - Application root: the directory you uploaded to (e.g. `theft-register`).
   - Application URL: your domain or subdomain.
   - Application startup file: `app.cjs` (Passenger loads it with `require()`, which cannot load the ES-module `app.js` directly; `app.cjs` imports it).
   This step generates the Passenger config (`.htaccess` and the app's `passenger_appenv` wiring) for you — you don't create it by hand.

4. **Set environment variables.** In the same Node.js App screen, add each variable from `.env.example`:
   - `NODE_ENV=production`
   - `PORT` (cPanel usually assigns/overrides this itself; leave it set)
   - `APP_ORIGIN` — the exact `https://` origin the app is served from (used for CSRF checks; a mismatch here causes every POST/PATCH to fail with 403)
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
   - `JWT_SECRET` — at least 32 random characters (`openssl rand -base64 48` or similar); the app refuses to start without one
   - `COOKIE_SECURE=true`
   Do **not** upload `.env` — set these through the cPanel UI instead, so secrets never sit in the uploaded tree or in git.

5. **Create the database and set privileges.** In cPanel → *MySQL® Databases*:
   - Create the database and a dedicated MySQL user (don't reuse the cPanel account's own DB user for this).
   - Add that user to the database with privileges limited to what the app needs: `SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER` (`CREATE`/`ALTER` are needed once, for `npm run migrate`'s `schema_migrations` table and future migrations — they can be revoked afterwards if you prefer a tighter steady-state grant of just `SELECT, INSERT, UPDATE, DELETE`, re-adding them temporarily for the next migration).
   - Note the full `dbuser_dbname`-style username/database cPanel generates — that's what goes in `DB_USER`/`DB_NAME`.

6. **Install dependencies.** In the Node.js App screen, use *Run NPM Install* (this runs inside cPanel's virtual environment with the right Node version) — or, via the "Enter to the virtual environment" terminal command cPanel shows you:

   ```bash
   npm install --omit=dev
   ```

7. **Run migrations and create the first admin.** From that same virtual-environment terminal, in the app's directory:

   ```bash
   mysql -u <user> -p <database> < schema.sql     # first deploy only
   npm run migrate
   npm run create-user -- --name "Admin Name" --email admin@example.com --admin
   ```

   `create-user` forces `is_admin` on regardless of the `--admin` flag when the users table is still empty, so the very first account is always an admin.

8. **Restart the app.** cPanel → *Setup Node.js App* → *Restart*. Visit the app URL and log in with the admin account just created.

### Redeploying after changes

If you uploaded via **cPanel Git Version Control**, `.cpanel.yml` at the repo root is already configured for this app (application root `liability-overview.rhsecurityltd.com`, Node 18.20.8). Every deploy is then: push to GitHub, then in cPanel → *Git™ Version Control* → *Manage* → *Update from Remote*, then *Deploy HEAD Commit*. That runs `.cpanel.yml`'s tasks automatically — `npm install`, `npm run build`, `npm run migrate`, and a Passenger restart — no manual steps 1, 6, 7, or 8 needed.

If you uploaded manually, repeat steps 1–2 (build, upload), then 6 (`npm install`, only if dependencies changed) and 7's `npm run migrate` (only if new migration files were added), then restart (step 8). Steps 3–5 are one-time setup either way.
