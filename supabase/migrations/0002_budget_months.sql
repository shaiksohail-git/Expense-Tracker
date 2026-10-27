-- Expense Tracker — per-month budgets
--
-- A budget used to be one recurring limit per category. It is now one limit
-- per category *per month*, so October can allow ₹8,000 for Groceries while
-- November allows ₹10,000.
--
-- `month` is the first day of the month (2026-10-01) rather than a string, so
-- ordering and comparisons are real date operations in Postgres.

alter table public.budgets add column month date;

-- Existing rows were recurring limits. Give each the month it was created in
-- rather than dropping someone's data; they can then edit that month and set
-- other months explicitly.
update public.budgets
set month = date_trunc('month', created_at)::date
where month is null;

alter table public.budgets alter column month set not null;

alter table public.budgets
  add constraint budgets_month_first_day
  check (month = date_trunc('month', month)::date);

-- One limit per category per month, replacing "one per category forever".
alter table public.budgets drop constraint budgets_category_unique;
alter table public.budgets
  add constraint budgets_category_month_unique unique (user_id, category_id, month);

create index budgets_user_month_idx on public.budgets (user_id, month);
