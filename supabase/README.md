# Database

The project uses one Supabase (Postgres) database. Everything the browser can
do is defined by the SQL in [`migrations/`](migrations) and by Row Level
Security — there is no custom server.

## Applying the schema

`migrations/` is the source of truth, applied in filename order. Both files
have already been applied to the project this app is wired to. To apply them
to another project:

1. Open the Supabase dashboard → **SQL Editor**.
2. Run the contents of `0001_init.sql`, then `0002_budget_months.sql`.

Or use the Supabase CLI:

```bash
supabase db push
```

## Tables

| Table | What one row is | Owner column |
| --- | --- | --- |
| `accounts` | A bank account, wallet or cash pot, with an optional opening balance | `user_id` |
| `categories` | A named income or expense category with a chart colour | `user_id` |
| `transactions` | One money event: income, expense or transfer | `user_id` |
| `budgets` | One spending limit for one category in one month | `user_id` |

`user_id` defaults to `auth.uid()`, so the browser never sends it.

## Rules enforced by the database

- **Amounts** are `numeric(12,2)` and must be greater than zero (max ₹10 crore).
- **Income / expense** rows must have a category and one account, and the
  category's `kind` must match the transaction type (a trigger checks this).
- **Transfers** must have two *different* accounts, no category, and no
  destination of the same account.
- **Cross-user references are impossible**: the foreign keys include
  `user_id`, so a transaction cannot point at another user's account or
  category even if the id were known.
- **Notes** are capped at 120 characters, matching the form.
- **Budgets** are unique per category per month
  (`unique (user_id, category_id, month)`) and must be positive (max ₹10
  crore). `month` is stored as the first day of the month (e.g. `2026-10-01`)
  and a check constraint enforces that. The app upserts on all three columns,
  so changing a limit can never create a duplicate, and a second month is a
  separate row. Deleting a budget leaves transactions untouched; deleting a
  category cascades to all of its budgets.
- `updated_at` is maintained by a trigger on every update.

## Row Level Security

RLS is enabled on all four tables. Each has a single policy of the form:

```sql
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id)
```

Anonymous (`anon`) access is revoked entirely. The public anon key alone
returns `401`; a signed-in user only ever sees their own rows.

## Starter data

On the first successful sign-in, the app creates two accounts (`Bank`, `Cash`)
and ten categories (Salary, Rent, Groceries, …) for that user. The seeding step
is idempotent: it only fills in what is missing and ignores duplicate-name
races between tabs.

## Synchronisation

- Every write is committed by Supabase before the screen updates. A rejected
  write leaves the form open and keeps a local draft, so nothing typed is lost.
- A new transaction carries a client-generated UUID. Retrying the same draft
  reuses that id; a `23505` duplicate-key response is resolved by reading the
  existing row back, so a lost response cannot produce two transactions.
- Other tabs in the same browser are told to reload over `BroadcastChannel`.
- Returning to a tab after more than five seconds, or coming back online,
  triggers a silent reload that keeps the current screen visible.
- There is **no Realtime subscription**. Another device sees changes when it
  loads the page, regains focus, or the user presses **Refresh now**. Do not
  describe the app as live-syncing.

## Verifying security and persistence

RLS is not "verified" by reading the policies — run the proof test, which
executes real queries as two separate users against this live database:

```bash
npm run test:rls
```

It needs `VITE_SUPABASE_URL` (from `.env.local`) and the database password
(from the gitignored `.supabase-db-password.txt`). It creates two throwaway
`auth.users`, and demonstrates that:

- a signed-in user sees only their own accounts, categories, transactions and
  budgets;
- reading / updating / deleting another user's row by id returns nothing;
- inserting a row with someone else's `user_id` is rejected by RLS;
- inserting a record that *references* another user's account is rejected by
  the foreign keys, even though the role can't see that row;
- the `anon` role is denied everything;

then deletes both test users (cascade removes their rows), so it leaves the
database clean. All twelve assertions must pass; the command exits non-zero
otherwise.

Persistence and refresh behaviour are proven separately through the same
public anon key the browser uses:

```bash
npm run test:cloud
```

That test signs two disposable users in through GoTrue, saves a transaction,
signs in a brand-new session (the page-refresh case), reads the row back, saves
from the second session and re-reads in the first, retries the same transaction
id and confirms exactly one row remains, upserts the same budget twice, then
confirms user B cannot read, update, delete, forge or reference user A's data.
Its 19 assertions must pass, and it deletes both accounts afterwards. If that
command has not been run successfully, persistence is **not** verified.

## Backups

**This project has no automatic backup configured or verified.** The
application never schedules one. Supabase's scheduled backups and
point-in-time recovery depend on the project's plan and add-ons, and that state
was not verifiable with the public key used here. Check
**Database → Backups** in the dashboard: if no backup is listed, none exists.

Options, most to least proven:

1. **In-app JSON export** — Settings → *Export your data*. This is the only
   backup path covered by an automated test (the export builders) and by the
   browser check. It is manual, unencrypted and a point-in-time snapshot.
2. **Supabase dashboard backups** — visible under *Database → Backups* when the
   plan includes them. Restoring a backup replaces database state; treat it as
   an operational action, not a user-facing feature.
3. **`pg_dump`** — needs the `pg_dump` binary on this machine (not installed
   here) and the database password in the gitignored
   `../.supabase-db-password.txt`:

   ```bash
   PGPASSWORD="$(cat ../.supabase-db-password.txt)" pg_dump \
     -h db.<project-ref>.supabase.co -p 5432 -U postgres -d postgres \
     --no-owner --no-privileges -f expense-tracker-backup.sql
   ```

   Keep that `.sql` file out of source control; it contains every user's data.

4. **Point-in-time recovery** — a paid add-on on some plans. It is not enabled
   or verified here.

Recovery limits worth stating plainly: there is no trash and no importer. The
UI's Undo works only immediately after a delete. Otherwise recovery means
restoring a database backup or re-entering rows from an export.
