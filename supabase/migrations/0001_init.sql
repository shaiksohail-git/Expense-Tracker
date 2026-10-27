-- Expense Tracker — initial schema
--
-- Design rules encoded here:
--   * every row belongs to exactly one Supabase auth user (`user_id`)
--   * Row Level Security makes that user the only one who can ever read or
--     change a row, even though the browser holds a public API key
--   * cross-user references are impossible: foreign keys include `user_id`
--   * "transfers" have two accounts and no category; income/expenses have
--     one account and a category of the matching kind
--   * money is numeric(12,2), always positive; direction comes from `type`

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts (wallets / bank accounts)
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  opening_balance numeric(12, 2) not null default 0 check (opening_balance >= 0),
  created_at timestamptz not null default now(),
  constraint accounts_name_unique unique (user_id, name),
  -- Referenced by transactions so an account can never be borrowed from
  -- another user's data.
  constraint accounts_id_user_unique unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('income', 'expense')),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  constraint categories_name_unique unique (user_id, name),
  constraint categories_id_user_unique unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  occurred_on date not null,
  type text not null check (type in ('income', 'expense', 'transfer')),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 100000000),
  category_id uuid,
  account_id uuid not null,
  to_account_id uuid,
  note text not null default '' check (char_length(note) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint transactions_category_fk foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete restrict,
  constraint transactions_account_fk foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  constraint transactions_to_account_fk foreign key (to_account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,

  -- The shape of each transaction type, enforced by the database itself.
  constraint transactions_shape check (
    (
      type = 'transfer'
      and category_id is null
      and to_account_id is not null
      and to_account_id <> account_id
    )
    or (
      type in ('income', 'expense')
      and category_id is not null
      and to_account_id is null
    )
  )
);

create index transactions_user_date_idx
  on public.transactions (user_id, occurred_on desc, created_at desc);
create index transactions_user_type_idx
  on public.transactions (user_id, type);
create index transactions_user_category_idx
  on public.transactions (user_id, category_id);

create trigger transactions_touch_updated_at
  before update on public.transactions
  for each row execute function public.touch_updated_at();

-- A category must belong to the same user *and* match the transaction type,
-- so an income can never be filed under "Rent".
create or replace function public.validate_transaction_category()
returns trigger
language plpgsql
as $$
declare
  category_kind text;
begin
  if new.type = 'transfer' then
    return new;
  end if;

  select kind into category_kind
  from public.categories
  where id = new.category_id and user_id = new.user_id;

  if category_kind is null then
    raise exception 'Category not found for this user';
  end if;
  if category_kind <> new.type then
    raise exception 'Category type must match the transaction type';
  end if;
  return new;
end;
$$;

create trigger transactions_validate_category
  before insert or update on public.transactions
  for each row execute function public.validate_transaction_category();

-- ---------------------------------------------------------------------------
-- Budgets (one monthly limit per category)
-- ---------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  monthly_limit numeric(12, 2) not null check (monthly_limit > 0 and monthly_limit <= 100000000),
  created_at timestamptz not null default now(),
  constraint budgets_category_unique unique (user_id, category_id),
  constraint budgets_category_fk foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete cascade
);

create index budgets_user_idx on public.budgets (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

-- Anonymous visitors have no business with these tables at all.
revoke all on public.accounts from anon;
revoke all on public.categories from anon;
revoke all on public.transactions from anon;
revoke all on public.budgets from anon;

create policy "accounts are private to their owner"
  on public.accounts for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "categories are private to their owner"
  on public.categories for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "transactions are private to their owner"
  on public.transactions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "budgets are private to their owner"
  on public.budgets for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
