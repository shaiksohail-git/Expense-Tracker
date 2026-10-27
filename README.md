# Expense Tracker

A personal expense tracker in ₹ (INR) with cloud sync across devices.
React + TypeScript + Tailwind + Recharts, backed by Supabase auth and Postgres
with row-level security — every balance, chart and budget figure is derived
from your own transactions, and only your account can read them.

## What works today

- Email + password sign-in; each account sees only its own data.
- Add, edit, delete and undo transactions (income, expenses, transfers).
- Search, filter by type/category/month, and sort.
- Dashboard totals, six-month chart, spending by category.
- Reports filtered by this month, the last 3 or 6 months, this year, or an
  inclusive custom date range. The monthly chart reports the same totals as
  the cards; clicking a bar or month drills into its categories and budgets.
  Every figure is derived from saved transactions, and empty ranges show zero
  with an explicit “no transactions” message.
- Set, change and delete a budget for any month, one per expense category.
  The budgets page follows the month chosen in its month picker and shows
  spending progress, remaining amount, at-limit and overspent categories, an
  overall bar, and spending that has no budget.
- Create, rename, recolour and delete categories under **Settings → Categories**.
  Renaming keeps every transaction and budget attached (they point at the
  category by id, not by name); a category's type and its deletion are locked
  while transactions or budgets still use it.
- Budget warnings for the selected month at 80% (amber) and when you go over
  (red), on the budgets page and in a toast after saving a transaction.
- Data is stored in Supabase, so a refresh (or another device) shows the same records.
- Saves are write-through: Supabase confirms the row before the screen changes.
  Returning to the tab, another tab saving, or **Settings → Refresh now** reloads
  from the cloud. There is no live push subscription, so a screen left open on
  another device updates only when one of those happens.
- A new transaction is kept as a local draft until it is saved or discarded, so
  a failed save, a closed dialog or a reload does not lose typing. Retrying uses
  the same client-generated row id, so it cannot create a duplicate.
- **Settings → Export your data** downloads a JSON backup (accounts, categories,
  budgets, every transaction) or a CSV ledger. The export contains only the
  signed-in user's rows and no credentials.

## Financial rules

Every balance, total, chart and budget figure is derived from the user's
transactions and account opening balances; nothing is hard-coded. The full
definitions — including how transfers, opening balances, savings and monthly
reporting are treated — are in
[docs/finance-rules.md](docs/finance-rules.md). The formulas are implemented
only in `src/lib/finance.ts` and covered by worked-example tests.

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The app needs `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in `.env.local` — copy `.env.example` and fill them in.
Without them you get a setup screen instead of the app.

First run: choose **Create account**, enter your email and a password of at
least 8 characters, then confirm the email Supabase sends you.

## Checks

```bash
npm test          # 156 unit tests: money rules, date ranges, budgets, validation, filters, mappers, export, drafts, retries
npm run build     # TypeScript typecheck + production build
npm run lint      # oxlint
npm run test:rls  # proves Row Level Security against the live database
npm run test:cloud # proves persistence, two-session reads, duplicate rejection and isolation through the anon key
```

The two live tests need `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in
`.env.local`, plus the database password in the gitignored
`.supabase-db-password.txt`. They create disposable accounts, print pass/fail,
and delete those accounts and all their rows afterwards.

If `npm test` cannot start because rolldown's native binary is blocked on this
machine, `npm run test:node` runs the same unit tests on Node's built-in runner
(no native binaries needed).

## Deploy

The app is a fully static site: `npm run build` typechecks and writes `dist/`,
and that folder is the entire deployment — there is no server to run.

1. Run the gates: `npm test`, `npm run lint`, `npm run build`.
2. Push the repo to GitHub. Confirm `git status` never lists `.env.local` or
   `.supabase-db-password.txt` (both are gitignored) — never commit them.
3. Import the repo into your host (Vercel, Netlify, Cloudflare Pages, …) with
   build command `npm run build` and output directory `dist`.
4. Set the two environment variables in the host's dashboard, copied from
   `.env.local`:
   - `VITE_SUPABASE_URL` — Supabase → Project Settings → API → Project URL
   - `VITE_SUPABASE_ANON_KEY` — same page, the **anon public** key
5. Configure an SPA fallback so every path serves `index.html`. On Vercel,
   add a `vercel.json` at the repo root:

   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```
6. Deploy, then open **Supabase → Authentication → URL Configuration** and add
   the live domain to Site URL and Redirect URLs. Until this is done, sign-up
   confirmation emails link back to `localhost` and will not open the site.

Production differences worth remembering:

- `VITE_` variables are inlined **at build time**, so editing one requires a
  redeploy, not just a restart.
- Anything `VITE_`-prefixed is visible to every visitor — only public values
  belong there. There is no service-role key in this project and none is
  needed; row-level security is what protects the data.
- HTTPS is required (the host provides it): transaction ids use
  `crypto.randomUUID`, which only exists in a secure context.
- A live page showing the setup screen instead of the app means the build-time
  variables were missing.
- A missing `engines` field means the host picks its own Node version; Vite 8
  needs Node ≥ 20.19 or ≥ 22.12.

### Post-deploy checklist

- [ ] Loads over HTTPS, no console errors, JS/CSS all 200
- [ ] Sign-in screen appears (not the setup screen)
- [ ] Sign-up confirmation email links to the **live domain**, not localhost
- [ ] Add income, expense and transfer → refresh → still there, totals match
- [ ] Same account on a second browser/device shows the same records
- [ ] Settings → Export downloads only your own rows
- [ ] Save while offline shows a clear error and loses nothing
- [ ] Signed-out window shows no data; Network tab carries only the anon key

## Layout

```
src/
  App.tsx                 auth gate: setup screen, loading, sign-in, or tracker
  TrackerApp.tsx          signed-in shell (navigation, dialogs, toasts)
  lib/
    auth.tsx              Supabase session provider
    useWorkspace.ts       loads a user's rows and performs CRUD
    db/workspace.ts       all Supabase queries
    db/rows.ts            database row <-> app model mapping
    transactionForm.ts    validation rules for adding/editing
    transactionQuery.ts   search, filter, sort (pure functions)
    finance.ts            totals, balances, date ranges, budget progress and warnings
    categoryForm.ts       category name/type/colour rules and usage locks
    draftStorage.ts       keeps unsaved new transactions in localStorage
    exportData.ts         JSON/CSV export builders and CSV formula escaping
  views/                  dashboard, transactions, budgets, reports, settings
                          (reports: presets, custom range, chart drill-down, CSV)
docs/
  finance-rules.md           definitions and worked examples for every money figure
supabase/
  migrations/0001_init.sql   schema, constraints and RLS policies
  migrations/0002_budget_months.sql   per-month budgets
  README.md                  security model, sync test and backup options
  tests/rls.test.mjs         live two-user RLS proof
  tests/cloud-sync.test.mjs  live persistence, refresh and duplicate proof
```

## Privacy

Row Level Security is enabled on every table with `user_id = auth.uid()`
policies, and anonymous access is revoked. The anon key in the browser can
read nothing on its own.

## Backups

**No automatic backup is configured or verified for this project.** The app
does not schedule one, and whether Supabase provides scheduled backups or
point-in-time recovery depends on the project's plan. Check
**Database → Backups** in the Supabase dashboard; if it lists nothing, assume
there is no backup.

The only backup this project can currently prove works is the JSON export in
**Settings → Export your data**. It is a manual snapshot. There is no importer
in the app, so recovery means restoring a database backup or re-entering rows
from an export. See [supabase/README.md](supabase/README.md#backups) for the
technical options and their caveats.
