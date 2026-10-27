/**
 * Row Level Security proof test.
 *
 * Connects to the project's Supabase Postgres database directly, creates two
 * throwaway test users, and demonstrates — with real queries as those users —
 * that:
 *
 *   1. a signed-in user sees only their own rows (accounts, categories,
 *      transactions, budgets)
 *   2. reading, updating or deleting another user's row returns nothing
 *      instead of the other user's data
 *   3. inserting a row that claims another user_id is rejected by RLS
 *   4. inserting a record that *references* another user's account or
 *      category is rejected by the foreign keys
 *   5. the anonymous role cannot touch the tables at all
 *
 * Cleanup is guaranteed: users are inserted within named emails and deleted
 * at the end (cascade removes their rows). If a test fails the exit code is 1.
 *
 * Run:  npm run test:rls    (from expense-tracker/)
 *
 * Credentials are read at runtime from gitignored files; they are never
 * printed.
 */

import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

// ---------------------------------------------------------------------------
// Find the credentials
// ---------------------------------------------------------------------------

const ROOT = path.resolve(import.meta.dirname, '../..')

function readEnvLocal() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const i = line.indexOf('=')
        return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}

const env = readEnvLocal()
const supabaseUrl = env.VITE_SUPABASE_URL
if (!supabaseUrl) {
  console.error('VITE_SUPABASE_URL not found in .env.local — nothing to test against.')
  process.exit(1)
}
const passwordFile = path.join(ROOT, '.supabase-db-password.txt')
if (!fs.existsSync(passwordFile)) {
  console.error('.supabase-db-password.txt not found — database password required for direct SQL.')
  process.exit(1)
}
const dbPassword = fs.readFileSync(passwordFile, 'utf8').trim()

// Postgres role that owns nothing and gets RLS applied:
// Two separate statements: pg cannot run a multi-statement string with
// parameters, so both halves get their own call below.
const AUTH_USER_SQL = `insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ($1::uuid, 'authenticated'::text, 'authenticated'::text, $2::text, 'not-a-real-password-hash', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())`
const AUTH_IDENTITY_SQL = `insert into auth.identities (user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at)
values ($1::uuid, $2::text, 'email'::text, jsonb_build_object('sub', $1::uuid::text, 'email', $2::text)::jsonb, now(), now(), now())`

// ---------------------------------------------------------------------------
// Connection: try the direct host first, then the regional poolers
// ---------------------------------------------------------------------------

const ref = new URL(supabaseUrl).hostname.split('.')[0]
const REGIONS = [
  'ap-southeast-1',
  'ap-south-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-central-1',
]

async function tryConnect() {
  const candidates = [
    { host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres' },
    ...REGIONS.map((region) => ({
      host: `aws-0-${region}.pooler.supabase.com`,
      port: 5432,
      user: `postgres.${ref}`,
    })),
  ]
  let lastError = null
  for (const c of candidates) {
    const client = new pg.Client({
      host: c.host,
      port: c.port,
      user: c.user,
      database: 'postgres',
      password: dbPassword,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 6000,
    })
    try {
      await client.connect()
      console.log(`Connected via ${c.host}:${c.port}`)
      return client
    } catch (error) {
      lastError = error
      await client.end().catch(() => {})
    }
  }
  console.error('Could not reach the database directly or via any regional pooler.')
  console.error('Last error:', lastError?.message)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

/** Becomes role `authenticated` with the given user's JWT sub, until COMMIT. */
async function actAs(client, userId) {
  await client.query('set local role authenticated')
  await client.query('select set_config($1, $2, true)', ['request.jwt.claims', JSON.stringify({ sub: userId })])
  await client.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId])
}

/** Ends a transaction cleanly even when a statement inside it errored. */
async function endTxn(client) {
  try {
    await client.query('commit')
  } catch {
    await client.query('rollback').catch(() => {})
  }
}

let failures = 0
function fail(name, detail) {
  failures++
  console.log(`FAIL  ${name}`)
  console.log(`      ${detail}`)
}
function pass(name) {
  console.log(`PASS  ${name}`)
}

/** Expect fn() to throw a Postgres error (optionally matching a message/code). */
async function expectRE(name, fn, match) {
  try {
    const result = await fn()
    fail(name, `expected the statement to be rejected, got: ${JSON.stringify(result?.rows ?? result)}`)
  } catch (error) {
    if (match && !match(error)) {
      fail(name, `rejected but with something else: ${error.code ?? ''} ${error.message}`)
    } else {
      pass(name)
    }
  }
}

// Fixed, well-known UUIDs so ids can compare across roles. Version-4-random
// bytes replaced with test markers; they are fresh users so no conflict.
const USER_A = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaa1'
const USER_B = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbb2'

const EMAIL_A = 'rls-test-a-expense-tracker@example.com'
const EMAIL_B = 'rls-test-b-expense-tracker@example.com'

async function run() {
  const client = await tryConnect()
  try {
    // -- Setup: two throwaway users -----------------------------------------
    await client.query(
      "delete from auth.users where email in ($1, $2)",
      [EMAIL_A, EMAIL_B],
    )
    await client.query(AUTH_USER_SQL, [USER_A, EMAIL_A])
    await client.query(AUTH_IDENTITY_SQL, [USER_A, EMAIL_A])
    await client.query(AUTH_USER_SQL, [USER_B, EMAIL_B])
    await client.query(AUTH_IDENTITY_SQL, [USER_B, EMAIL_B])

    // -- 1. User A writes their own data ------------------------------------
    let accountId, categoryId, transactionId, budgetId
    await client.query('begin')
    await actAs(client, USER_A)
    try {
      const acc = await client.query(
        'insert into accounts (name, opening_balance) values ($1, $2) returning id',
        ['RLS test bank', '2500.00'],
      )
      accountId = acc.rows[0].id
      const cat = await client.query(
        "insert into categories (name, kind, color) values ($1, 'expense', '#ef4444') returning id",
        ['RLS test cat'],
      )
      categoryId = cat.rows[0].id
      const tx = await client.query(
        "insert into transactions (occurred_on, type, amount, category_id, account_id, note) values (current_date - 3, 'expense', 187.50, $1, $2, 'RLS test spend') returning id",
        [categoryId, accountId],
      )
      transactionId = tx.rows[0].id
      const bud = await client.query(
        'insert into budgets (category_id, monthly_limit, month) values ($1, $2, date_trunc($3, current_date)::date) returning id',
        [categoryId, '8000.00', 'month'],
      )
      budgetId = bud.rows[0].id
    } finally {
      await endTxn(client)
    }
    pass('owner can insert their own account, category, transaction and budget')

    // User B also seeds something of their own so counts are non-zero.
    await client.query('begin')
    await actAs(client, USER_B)
    try {
      await client.query(
        'insert into accounts (name) values ($1)',
        ["Bob's only account"],
      )
    } finally {
      await endTxn(client)
    }

    // -- 2. The other user sees nothing of A's data --------------------------
    await client.query('begin')
    await actAs(client, USER_B)
    try {
      const own = await client.query('select count(*)::int as n from accounts')
      if (own.rows[0].n === 1) pass('user B sees exactly one account: their own')
      else fail('isolation of list reads', `B's account list has ${own.rows[0].n} rows, expected 1`)

      const byId = await client.query('select * from accounts where id = $1', [accountId])
      if (byId.rowCount === 0) pass('direct id lookup of another user\u2019s row returns 0 rows')
      else fail('direct id lookup', `A's account was returned to user B: ${JSON.stringify(byId.rows)}`)

      const cats = await client.query('select * from categories where id = $1', [categoryId])
      if (cats.rowCount === 0) pass('another user\u2019s category lookup returns 0 rows')
      else fail('category lookup', JSON.stringify(cats.rows))

      const txs = await client.query('select * from transactions where id = $1', [transactionId])
      if (txs.rowCount === 0) pass('another user\u2019s transaction lookup returns 0 rows')
      else fail('transaction lookup', JSON.stringify(txs.rows))

      const buds = await client.query('select * from budgets where id = $1', [budgetId])
      if (buds.rowCount === 0) pass('another user\u2019s budget lookup returns 0 rows')
      else fail('budget lookup', JSON.stringify(buds.rows))

      const upd = await client.query(
        'update accounts set opening_balance = 0 where id = $1',
        [accountId],
      )
      if (upd.rowCount === 0) pass('attempt to update another user\u2019s row changes nothing')
      else fail('update', `changed ${upd.rowCount} rows`)

      const del = await client.query('delete from accounts where id = $1', [accountId])
      if (del.rowCount === 0) pass('attempt to delete another user\u2019s row removes nothing')
      else fail('delete', `removed ${del.rowCount} rows`)
    } finally {
      await endTxn(client)
    }

    // -- 3. Writing someone else's user_id is rejected -----------------------
    await expectRE(
      'insert with another user\u2019s user_id is rejected',
      async () => {
        await client.query('begin')
        await actAs(client, USER_A)
        try {
          return await client.query("insert into accounts (user_id, name) values ($1, 'stolen')", [USER_B])
        } finally {
          await endTxn(client)
        }
      },
    )

    // -- 4. Referencing another user's rows is rejected by the FKs -----------
    await expectRE(
      'transaction referencing another user\u2019s account is rejected',
      async () => {
        await client.query('begin')
        await actAs(client, USER_B)
        try {
          const cat = await client.query(
            "insert into categories (name, kind, color) values ($1, 'income', '#22c55e') returning id",
            ['RLS test income'],
          )
          return await client.query(
            "insert into transactions (occurred_on, type, amount, category_id, account_id) values (current_date, 'income', 100.00, $1, $2)",
            [cat.rows[0].id, accountId],
          )
        } finally {
          await endTxn(client)
        }
      },
      (error) =>
        error.code === '23503' ||
        /foreign key|violates foreign/i.test(error.message),
    )

    // -- 5. Anonymous role gets nothing --------------------------------------
    await expectRE(
      'anonymous users are denied entirely',
      async () => {
        await client.query('begin')
        await client.query('set local role anon')
        try {
          return await client.query('select * from accounts')
        } finally {
          await endTxn(client)
        }
      },
      (error) =>
        error.code === '42501' || /permission denied/i.test(error.message),
    )

    // Sanity: A still owns everything they created.
    await client.query('begin')
    await actAs(client, USER_A)
    try {
      const own = await client.query('select count(*)::int as n from transactions where id = $1', [transactionId])
      if (own.rows[0].n === 1) pass("owner's data still intact afterwards")
      else fail('owner intact', `A could not see their own transaction afterwards (${own.rows[0].n})`)
    } finally {
      await endTxn(client)
    }
  } finally {
    // -- Cleanup, performed as the owner ------------------------------------
    try {
      await client.query('rollback').catch(() => {}) // clear any aborted block
      await client.query(
        'delete from auth.users where id = any($1::uuid[])',
        [[USER_A, USER_B]],
      )
      console.log('Cleaned up both test users and their rows.')
    } catch (error) {
      console.error('CLEANUP PROBLEM — remove these rows manually:')
      console.error(`  delete from auth.users where id in ('${USER_A}', '${USER_B}');`)
      console.error(error.message)
    }
    await client.end()
  }

  console.log(
    failures === 0
      ? '\nAll RLS security tests passed.'
      : `\n${failures} RLS test(s) FAILED.`,
  )
}

run().then(() => process.exit(failures === 0 ? 0 : 1)).catch((error) => {
  console.error(error)
  process.exit(1)
})
