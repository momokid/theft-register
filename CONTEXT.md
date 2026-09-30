# CONTEXT.md — Why this app exists

## The business
**RH Security Ltd (RHSL)** provides patrol and guarding services for telecom tower sites. The client is **Netis**, which manages the sites (with **REIME**, a partner company, on some). There are two contracts:
- **HTG:** sites mainly in Greater Accra, Eastern, Central and Western regions.
- **ATC:** the Western / Western North / Ashanti region sites.

Netis reports thefts at sites in WhatsApp groups. It may bill RH for losses (debit notes). RH needs its own record to **check, price, and dispute** those claims.

## Where the data comes from
1. WhatsApp group chats were exported to text:
   - HTG: "Netis-RHSL Patrols", Sep 2025 – Sep 2026
   - ATC: "NETIS-RHSL ATC WR/WN/AR Patrols", Feb – Sep 2026
2. Theft posts were extracted, reviewed by hand, and saved in an Excel workbook (`Theft_Register_HTG_ATC.xlsx`), with each row flagged where the data is unreliable.
3. The workbook was loaded into MySQL (table `thefts`, 172 rows: 148 HTG and 24 ATC).
4. **ATC is incomplete by design.** Most ATC theft details were posted as photos, and only the text was extracted. Future imports may add rows.

## Who uses it
RH Security staff only. There are two kinds of account:
- **Admin:** manages accounts, imports workbook data, reads the audit log.
- **User:** views thefts, sets prices, exports, prints.

## What they need to do
- Filter thefts by project, site, date range, item type, and flagged status.
- Price the losses. **One price per item type per period** (for example, diesel for June), with a per-row **override** where a specific item is priced differently.
- See subtotals, the grand total, fuel lost, and a monthly chart. Totals always reflect the current prices.
- Check any extracted row against the **original WhatsApp post** (raw_post) for auditing.
- Print a report and export to Excel.
- Import more rows from the workbook safely: preview first, never duplicate, never overwrite prices.
- Know who changed what (audit log).

## Domain glossary
| Term | Meaning |
|---|---|
| Site ID / Site name | Telecom tower site, for example `1335 Tarkwa Aboso`. |
| RH (reading) | **Run Hours** of the site's generator (genset). *Not* RH Security. RH before is from the last visit; RH after is from the theft visit. |
| Dipstick | Manual fuel level in **cm** (some posts also give litres). |
| Probe / Deep Sea | Electronic fuel level in **litres**. It often disagrees with the dipstick. |
| Fuel before | The final fuel level (L) after the last refuelling visit. |
| Fuel after | The fuel level (L) found at the theft visit. |
| Quantity lost | Fuel: before − after, **raw**, with no adjustment for generator consumption or delivery shortage. Cable: metres. Items: pieces. |
| Last visit date | Date of the previous refuel/visit that the "before" readings come from. |
| Date (post_date) | The WhatsApp posting date. **Prices are matched by this date.** |
| Theft date | The date written inside the post. Often blank. |
| Item type | Standard group used for pricing (Fuel, Earth cable, DC cable, Starter battery, …). `item_stolen` keeps the original wording. |
| Source msg IDs | `PROJECT-line` references to the chat export lines, for example `HTG-9365`. |
| Raw post | The verbatim WhatsApp message text the row came from. |
| Flags | Data-quality warnings. See the table below. |

## Flags (set during extraction, read-only in the app)
| Flag | Meaning |
|---|---|
| UNCLEAR READINGS | RH or fuel reading missing before or after. |
| QTY MISSING | Quantity not stated or can't be calculated. |
| READINGS MISMATCH | Probe, dipstick, and/or stated fuel level disagree. |
| SAME-DAY DUPLICATE | Posted more than once on the same day; kept as one row. |
| REPOST | Same theft posted again on a later date; kept as one row. |
| DATA ERROR | Impossible value in the post (typo dates, sums that don't add up). Kept as posted. |
| NO SITE | No site ID or name in the post. |
| SITE INFERRED | Site taken from nearby messages, not from the theft post itself. |
| OTHER POSTER | HTG only: posted by someone other than the Netis/REIME client accounts. |

## Decisions already made (don't reopen without asking)
1. Stack: Node.js + Express API, React SPA, MySQL, hosted on **cPanel** (Passenger). The owner confirmed cPanel supports Node apps.
2. Extracted theft data is **read-only** in the app, with one exception: `quantity_lost` is directly editable (2026-09-30, superseding the original "only prices change" rule) to correct misreads. It uses the same input + hidden Override-button UX as price, a `quantity_override` flag (mirrors `price_override`), and an audit row per edit. Unlike price, there's no bulk "apply" for quantity and no meaningful "clear to unset" — the override flag is a permanent audit marker, not something a user toggles off. See REFERENCE.md §4/§5/§7.
3. Subtotal and grand total are **never stored**. They're computed from quantity × unit price, so any price change is reflected at once.
4. "Apply price" never overwrites a row override. An override is set with the per-row **Override** button, which appears only when the price input has been changed.
5. Prices are matched by **post_date** (the WhatsApp date), because theft_date is mostly blank.
6. Import reads the sheet **"All (for import)"**. Duplicates (project + source msg IDs + item) are **skipped, never updated**. Any error row blocks the commit.
7. Accounts are never deleted, only deactivated. At least one active admin must always exist.
8. The audit log is append-only and never contains passwords.
9. Theme toggle (light/dark). The print report and Excel export use the same filter as the dashboard.

## Out of scope
Editing extracted data, deleting thefts, reading photos, WhatsApp integration, email notifications, and multi-currency (everything is GHS).