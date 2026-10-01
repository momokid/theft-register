# REFERENCE.md — Technical reference

## §1 Architecture
- One Node/Express app on cPanel (Passenger). It serves `/api/*` plus the built React SPA from `client/dist`, with an SPA fallback to `index.html` for any non-`/api` GET.
- MySQL (InnoDB, utf8mb4).
- Auth is a JWT in an httpOnly cookie. The frontend and API share the same origin, so no CORS is needed.

```
/app.js                  Passenger entry → imports server/index.js
/server/index.js         app setup, middleware, routes, error handler
/server/db.js            mysql2 pool + tx(fn) helper
/server/auth.js          login/logout, requireAuth, requireAdmin, origin check
/server/audit.js         audit(conn, {userId, action, entity, entityId, oldValue, newValue, meta, ip})
/server/validate.js      small hand-written validators
/server/filters.js       buildTheftFilter(query) → {where, params}  (shared)
/server/routes/          auth.js, meta.js, thefts.js, prices.js, export.js, import.js, users.js, audit.js
/server/services/        importXlsx.js, exportXlsx.js
/client/                 Vite + React
/migrations/             001_price_override.sql, 002_admin.sql, 003_audit_log.sql
/scripts/                migrate.js, create-user.js
/test/                   *.test.js (node:test)
/.env.example
/README.md               cPanel deploy steps
```

## §2 Allowed packages
- **Server:** `express`, `mysql2`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `helmet`, `express-rate-limit`, `compression`, `multer`, `exceljs`, `dotenv`.
- **Client:** `react`, `react-dom`, `recharts`.
- **Dev:** `vite`, `@vitejs/plugin-react`.

Pin exact versions. Commit `package-lock.json`.

## §3 Environment (`.env.example`)
```
NODE_ENV=production
PORT=3000
APP_ORIGIN=https://theft.example.com
DB_HOST=localhost
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
JWT_SECRET=            # ≥ 32 random chars; app refuses to start otherwise
COOKIE_SECURE=true
```

## §4 Database
Existing tables come from `schema.sql`, with data from `data.sql`. **Do not alter existing columns.**

### thefts (existing)
`id, project ENUM('HTG','ATC'), post_date DATE, theft_date DATE NULL, site_id VARCHAR(20) NULL, site_name VARCHAR(100) NULL, last_visit_date DATE NULL, item_stolen VARCHAR(150), item_type VARCHAR(40), unit VARCHAR(5) ('L'|'m'|'pcs'|'-'), length VARCHAR(20) NULL, rh_before, rh_after DECIMAL(10,2) NULL, dipstick_before_cm, dipstick_after_cm DECIMAL(6,2) NULL, probe_before_l, probe_after_l, fuel_before_l, fuel_after_l DECIMAL(8,2) NULL, quantity_lost DECIMAL(10,2) NULL, unit_price DECIMAL(12,2) NULL, posted_by VARCHAR(60) NULL, source_time VARCHAR(80) NULL, source_msg_ids VARCHAR(120), flags VARCHAR(200) NULL, remarks TEXT NULL, raw_post MEDIUMTEXT NULL, created_at, updated_at`

- Unique key: `uq_source_item (project, source_msg_ids, item_stolen)`.
- Indexes: `post_date`, `site_id`, `item_type`.

### users (existing)
`id, name VARCHAR(100), email VARCHAR(150) UNIQUE, password_hash VARCHAR(255), is_active TINYINT(1), created_at`

### Migrations (tracked in `schema_migrations(name VARCHAR(100) PK, applied_at TIMESTAMP)`)
```sql
-- 001_price_override.sql
ALTER TABLE thefts ADD COLUMN price_override TINYINT(1) NOT NULL DEFAULT 0 AFTER unit_price;

-- 002_admin.sql
ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash;

-- 003_audit_log.sql
CREATE TABLE audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  entity VARCHAR(30) NULL,
  entity_id VARCHAR(40) NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  meta JSON NULL,
  ip VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_created (created_at), KEY idx_user (user_id), KEY idx_action (action),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 004_quantity_override.sql (2026-09-30, mirrors price_override)
ALTER TABLE thefts ADD COLUMN quantity_override TINYINT(1) NOT NULL DEFAULT 0 AFTER quantity_lost;

-- 005_quantity_ned.sql (2026-10-01)
ALTER TABLE thefts ADD COLUMN quantity_ned DECIMAL(10,2) NULL AFTER quantity_override;

-- 006_quantity_ned_override.sql (2026-10-01, mirrors quantity_override)
ALTER TABLE thefts ADD COLUMN quantity_ned_override TINYINT(1) NOT NULL DEFAULT 0 AFTER quantity_ned;
```
The README must recommend granting the app's DB user only `INSERT, SELECT` on `audit_log`.

## §5 Business rules
- **Subtotal** = `quantity_ned * unit_price` (2026-10-01, superseding `quantity_lost * unit_price` — see the `quantity_ned` entry below), computed in SQL. It is NULL if either value is NULL. **Never stored.**
- **Grand total** = `SUM(subtotal)` over the full filtered set, not just the current page. Also keyed off `quantity_ned` as of 2026-10-01.
- **Unpriced** = rows where `quantity_lost IS NOT NULL AND unit_price IS NULL`. Still `quantity_lost`-based — this counts rows missing a price, not a subtotal calculation.
- **Fuel lost** = `SUM(quantity_lost) WHERE item_type='Fuel'`. Still `quantity_lost`-based, same reasoning as unpriced.
- **Chart group:** unit `L` → fuel, `m` → cable, else → equipment. `by_month` = subtotals (quantity_ned-based) grouped by `DATE_FORMAT(post_date,'%Y-%m')`.
- **Apply price:** `UPDATE thefts SET unit_price=? WHERE item_type=? AND post_date BETWEEN ? AND ? [AND project=?] AND price_override=0`. First SELECT the affected ids and their old prices **FOR UPDATE** inside the same transaction, then write one `price_apply` audit row.
- **Override:** `PATCH` with a number → `unit_price=?, price_override=1`. With `null` → `unit_price=NULL, price_override=0`. Audit as `price_override` or `price_clear`, with the old and new values.
- Only `unit_price`, `price_override`, `quantity_lost`, `quantity_override`, `quantity_ned`, and `quantity_ned_override` are ever updated on `thefts`.
- **Price validation:** a number, ≥ 0, ≤ 9,999,999.99, at most 2 decimals.
- **Quantity correction** (2026-09-30, both quantities as of 2026-10-01): `PATCH /api/thefts/:id/quantity` with `{quantity_lost:number}` → `quantity_lost=?, quantity_override=1`; `PATCH /api/thefts/:id/quantity_ned` with `{quantity_ned:number}` mirrors it exactly → `quantity_ned=?, quantity_ned_override=1`. **Admin-only as of 2026-10-01** (`requireAuth, requireAdmin`) for both routes — price editing remains open to any authenticated user. Audit as `quantity_override`/`quantity_ned_override`, with old and new values. No bulk apply, and no "clear" — unlike price, there's no meaningful null/unset state to revert to, so the flag is a permanent audit marker. Validation: a number, ≥ 0, ≤ 99,999,999.99 (fits `DECIMAL(10,2)`), at most 2 decimals.
- **`quantity_ned`** (2026-10-01): a second, independent quantity-lost figure sourced from NED (a different data source than the original extraction), stored alongside `quantity_lost` for comparison. As of 2026-10-01 it drives subtotal/grand total (see above) and is independently editable by admins via its own route and override flag — editing `quantity_lost` never touches `quantity_ned` or the subtotal, and vice versa. Because `quantity_ned` is populated far more sparsely than `quantity_lost` in the existing dataset, rows without a `quantity_ned` value show a NULL subtotal and drop out of the grand total, even if `quantity_lost` and `unit_price` are both set.

## §6 Filters (shared by list, summary, export, print)
`project` (HTG|ATC), `site_id` (string), `from`/`to` (YYYY-MM-DD, on post_date, inclusive), `item_type` (must exist in the DB), `flagged` (1 = `flags IS NOT NULL AND flags <> ''`).
- Sort: `post_date ASC, id ASC` (oldest first) by default; `?sort=post_date_desc` reverses it. `sort` goes through a whitelist map (`post_date_asc`/`post_date_desc` only), same as every other filter/sort field. Shared by the list and export endpoints; the print report reflects whatever sort is active in the datasheet. (2026-10-01: default flipped from DESC to ASC, then made toggleable via the Date column header.)
- Unknown query keys → 400.

## §7 API
All JSON. Errors are `{error}` with status 400, 401, 403, 404, 409, 413, or 500. Everything except login requires auth. POST, PATCH, and DELETE require the `Origin` to equal `APP_ORIGIN`.

| Method | Path | Role | Request | Response |
|---|---|---|---|---|
| POST | /api/auth/login | – | `{email,password}` | `{user}` + cookie |
| POST | /api/auth/logout | any | – | 204 |
| GET | /api/auth/me | any | – | `{id,name,email,is_admin}` |
| GET | /api/meta | any | – | `{projects, sites:[{site_id,site_name}], item_types:[{item_type,unit}]}` |
| GET | /api/thefts | any | filters + `page, pageSize(≤100)` or `all=1 (≤5000)` | `{rows:[…no raw_post…, subtotal], total}` |
| GET | /api/thefts/:id | any | – | full row incl. `raw_post`, `subtotal` |
| GET | /api/summary | any | filters | `{rows, fuel_lost_l, flagged, unpriced, grand_total, by_month:[{month,fuel,cable,equipment}]}` |
| PATCH | /api/thefts/:id/price | any | `{unit_price:number\|null}` | updated row |
| PATCH | /api/thefts/:id/quantity | any | `{quantity_lost:number}` (2026-09-30) | updated row |
| POST | /api/prices/apply | any | `{item_type,from,to,project?,unit_price}` | `{updated, skipped_overrides}` |
| GET | /api/export.xlsx | any | filters | xlsx file |
| POST | /api/import/preview | admin | multipart `file` | `{counts:{new,duplicate,error}, rows:[first 200 with status, reason]}` |
| POST | /api/import/commit | admin | multipart `file` | `{inserted, skipped}` or 409 if errors |
| GET | /api/users | admin | – | list, never hashes |
| POST | /api/users | admin | `{name,email,password,is_admin}` | user |
| PATCH | /api/users/:id | admin | any of `{name,email,is_admin,is_active}` | user |
| POST | /api/users/:id/reset-password | admin | `{password}` | 204 |
| GET | /api/audit | admin | `user_id, action, from, to, page` | `{rows,total}` newest first |

## §8 Import (xlsx)
- Read the sheet **"All (for import)"**. Map columns by header text (trimmed, case-insensitive). Missing required headers → 400 listing them.
- Header → column: `PROJECT→project, DATE→post_date, THEFT DATE→theft_date, SITE ID→site_id, SITE NAME→site_name, LAST VISIT DATE→last_visit_date, ITEM STOLEN→item_stolen, ITEM TYPE→item_type, UNIT→unit, LENGTH→length, RH BEFORE→rh_before, RH AFTER→rh_after, DIPSTICK BEFORE (cm)→dipstick_before_cm, DIPSTICK AFTER (cm)→dipstick_after_cm, PROBE BEFORE (L)→probe_before_l, PROBE AFTER (L)→probe_after_l, FUEL BEFORE (L)→fuel_before_l, FUEL AFTER (L)→fuel_after_l, QUANTITY LOST→quantity_lost, POSTED BY→posted_by, SOURCE (chat msg)→source_time, SOURCE MSG IDS→source_msg_ids, FLAG→flags, REMARKS→remarks, RAW POST→raw_post`.
- Ignore `UNIT COST (GHS), SUBTOTAL (GHS), FUEL RATE REF (GHS/L)`. Imported rows get `unit_price=NULL, price_override=0`.
- Stop at the first fully empty row. That skips the totals block under the data.
- Read formula cells by their cached `result`. If quantity_lost is empty and the item type is Fuel with both fuel values present, compute before − after.
- **Required:** project, post_date, item_stolen, item_type, unit, source_msg_ids. Dates must be valid Excel dates. Numbers must be numeric. String lengths must fit the columns.
- **Status per row:** `error` (with a reason), `duplicate` (the key exists in the DB, or earlier in the file), or `new`.
- **Commit:** parse and validate again. If any row is an error → 409. Otherwise insert the new rows in **one transaction**, using batched multi-row INSERT of 100 rows at a time. Audit `import` with `{file_name, inserted, skipped}`.

## §9 Export (xlsx)
- The same filter as the dashboard, capped at 5,000 rows.
- **Sheet "Thefts":** every theft column (including raw_post), plus unit_price, price_override, and subtotal (values). A bold totals row with fuel lost and the grand total.
- **Sheet "Filters":** the filters used, generated by, and generated at.
- File name: `theft-register-YYYYMMDD-HHmm.xlsx`. All text is written as string cells. Audit `export` with the filters and row count.

## §10 Accounts
- Passwords: at least 10 characters, bcrypt cost 12. Emails are stored lowercased and trimmed; duplicates → 409.
- An admin cannot change their own `is_admin` or `is_active`. Any change that would leave **zero active admins** → 409.
- No delete. `is_active=0` blocks login and ends existing sessions (checked on each request).
- Audit `user_create`, `user_update` (only the changed fields), and `user_password_reset` (no password data). Log `login`, `login_failed` (email in meta), and `logout` too.
- **create-user script:** if the users table is empty, force `is_admin=1`.

## §11 UI
- **Login:** email, password, generic error message, Sign in button.
- **Header:** app name; theme toggle (localStorage, defaults to `prefers-color-scheme`); user name; logout. Tabs: Dashboard, plus Import, Accounts, and Audit log for admins.
- **Dashboard:**
  - **Filters:** project, site (searchable), from/to, item type, flagged. Debounced; abort stale requests.
  - **Cards:** Rows, Fuel lost (L), Flagged, Unpriced, Grand total (GHS).
  - **Chart:** stacked bars by month (fuel / cable / equipment), in GHS.
  - **Apply price bar:** item type, from/to (defaults to the filter), project, price. A confirm dialog, then "Updated X · skipped Y overrides".
  - **Buttons:** Export Excel, Print report.
  - **Table:** Date, Project, Site, Item, Type, Qty + unit, Qty (NED) + unit, Unit price, Subtotal, Flags, View. Flagged rows are tinted. 50 per page. Footer shows the grand total from the summary.
    - **Unit price cell:** an input. The **Override** button shows **only when the input differs from the saved value**. Clicking it or pressing Enter saves and the button disappears on its own (the saved value now matches the input, so it's no longer dirty). Esc reverts the in-progress edit. Overridden rows show an "override" badge. No × to clear (2026-09-30, superseding the original "badge + × to clear" spec — the badge alone was decided sufficient; to unset a price now, type over the value).
    - **Qty cell and Qty (NED) cell** (2026-09-30, NED cell added 2026-10-01): same input/save/Esc-revert interaction as unit price, each independently audited with its own "edited" badge. **Admin-only** — non-admins see the value and badge as plain text, no input (server-enforced via `requireAdmin` on both routes, not just hidden client-side).
  - **Source drawer:** extracted fields on the left, raw_post on the right (pre-wrap, read-only).
- **Print report:** title, filters, generated by/at, cards, chart, and **all** filtered rows (no raw_post). `@media print` A4, repeating table headers, a Print button that calls `window.print()`.
- **Import tab:** choose file → Preview (counts, status filter, reasons) → Commit (disabled while errors exist) → result.
- **Accounts tab:** table, create form (password entered twice), edit modal, reset-password modal, deactivate/activate.
- **Audit log tab:** filters (user, action, date range), paginated table, old and new values shown as readable key: value pairs.
- **Formats:** dates DD/MM/YYYY; money `GHS 1,234.00`. Loading and error states everywhere. Works on a phone: filters stack and tables scroll horizontally.

## §12 Phases (stop after each)
1. Server skeleton, env check, DB pool, migrations and migrate script, create-user script, auth + role + origin middleware, audit helper, error handler.
2. Shared filter builder; meta, thefts list and detail, summary.
3. Price override, clear, and apply, with audit and transactions.
4. Client shell: login, theme, tabs, fetch helper, filters, cards, table, pagination, source drawer.
5. Client: override button behaviour, apply-price bar, chart.
6. Export and print report.
7. Import preview and commit, plus the Import tab.
8. Accounts and the audit log (API + UI).
9. README: cPanel deploy steps (build locally, upload, env vars in cPanel, npm install, migrate, create the first admin, restart, DB privileges).

## §13 Acceptance checks
1. No filter: 172 rows. Fuel lost 22,532 L (HTG 21,205 + ATC 1,327).
2. The grand total equals `SELECT SUM(quantity_ned*unit_price)` with the same WHERE, on every filter combination tested (2026-10-01: was `quantity_lost*unit_price`).
3. The Override button is hidden until the input changes, and hidden again after saving or pressing Esc.
4. Apply GHS 10 to Fuel; override one fuel row to 12; apply GHS 11 to Fuel: that row stays 12, `skipped_overrides=1`, and the audit row holds the old prices.
5. Re-importing the original workbook: preview shows 0 new and 172 duplicates; commit inserts 0.
6. A workbook with one invalid date: preview shows 1 error, commit returns 409, and the DB is unchanged.
7. The export's row count and grand total match the dashboard for the same filter.
8. The print report lists every filtered row, not just the current page.
9. With no cookie, every route except login returns 401. A non-admin on an admin route gets 403. A POST with a foreign Origin gets 403.
10. A deactivated user's existing session gets 401 on the next request.
11. An admin can't demote or deactivate themselves, and the last active admin can't be removed (409).
12. The audit log has no password data, and no route updates or deletes audit rows.
13. raw_post is absent from the list endpoint and the print report, and it renders as plain text (a `<script>` in raw_post shows as text).
14. An upload over 10 MB → 413. A non-xlsx file renamed to .xlsx → 400.