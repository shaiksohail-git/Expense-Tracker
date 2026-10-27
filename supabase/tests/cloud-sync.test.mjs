/**
 * Live cloud persistence and synchronisation test.
 *
 * This is not a mock: it talks to the project configured in `.env.local`
 * through the same public anon key the browser uses, and to Postgres only to
 * create and delete disposable accounts.
 *
 * It proves, as two real signed-in users:
 *
 *   1. a transaction written by one session is still there when a completely
 *      new session signs in (the "reload the page / another device" case)
 *   2. a write in session B is visible in session A after A re-reads
 *   3. user B cannot read, update or delete user A's transaction
 *   4. user B cannot forge A's user_id, nor reference A's account
 *   5. retrying a transaction with the same client-generated id is rejected
 *      by the primary key instead of creating a second row — the app turns
 *      that rejection into the already-saved row
 *   6. a repeated budget upsert updates one row instead of duplicating it
 *
 * Cleanup always runs: both test users are deleted and their rows cascade.
 *
 * Run:  npm run test:cloud
 * Needs: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in `.env.local`, and
 *        the database password in `.supabase-db-password.txt`.
 * Nothing secret is printed.
 */

import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

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
        return [
          line.slice(0, i).trim(),
          line.slice(i + 1).trim().replace(/^["']|["']$/g, ''),
        ]
      }),
  )
}

const env = readEnvLocal()
const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const passwordFile = path.join(ROOT, '.supabase-db-password.txt')
if (!fs.existsSync(passwordFile)) {
  console.error('.supabase-db-password.txt not found — needed to create and delete test users.')
  process.exit(1)
}
const dbPassword = fs.readFileSync(passwordFile, 'utf8').trim()
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]

const PASSWORD = 'cloud-sync-test-password-123'
const stamp = Date.now()
const EMAIL_A = `cloud-sync-${stamp}-a@codebuff-test.dev`
const EMAIL_B = `cloud-sync-${stamp}-b@codebuff-test.dev`

const USER_A = randomUUID()
const USER_B = randomUUID()

const AUTH_USER_SQL = `insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    $1::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
    $2::text, extensions.crypt($3::text, extensions.gen_salt('bf')), now(),
    '', '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now()
  )`

const AUTH_IDENTITY_SQL = `insert into auth.identities (
    user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
  ) values (
    $1::uuid, $2::text, 'email',
    jsonb_build_object('sub', $1::text, 'email', $2::text),
    now(), now(), now()
  )`

let failures = 0
const results = []

function pass(name, detail = '') {
  results.push(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail) {
  failures++
  results.push(`FAIL  ${name}\n      ${detail}`)
}

function check(name, condition, detail) {
  if (condition) pass(name, detail)
  else fail(name, detail)
}

/** A browser session: its own storage, its own tokens. */
function session() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function signIn(email) {
  const client = session()
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`)
  return { client, userId: data.user.id }
}

async function count(client, table) {
  const { data, error } = await client.from(table).select('id')
  if (error) throw new Error(`${table} read failed: ${error.message}`)
  return data?.length ?? 0
}

async function main() {
  const db = new pg.Client({
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    user: 'postgres',
    database: 'postgres',
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  })
  await db.connect()

  try {
    // Remove anything a previously interrupted run left behind.
    await db.query("delete from auth.users where email like 'cloud-sync-%@codebuff-test.dev'")
    await db.query(AUTH_USER_SQL, [USER_A, EMAIL_A, PASSWORD])
    await db.query(AUTH_IDENTITY_SQL, [USER_A, EMAIL_A])
    await db.query(AUTH_USER_SQL, [USER_B, EMAIL_B, PASSWORD])
    await db.query(AUTH_IDENTITY_SQL, [USER_B, EMAIL_B])

    // -- Session A (device 1) ------------------------------------------------
    const a1 = await signIn(EMAIL_A)
    check('session A signs in with email and password', a1.userId === USER_A)

    const accountId = randomUUID()
    const categoryId = randomUUID()
    const transactionId = randomUUID()
    const today = new Date().toISOString().slice(0, 10)

    const accountRes = await a1.client
      .from('accounts')
      .insert({ id: accountId, name: 'Cloud test bank', opening_balance: 2500 })
      .select('id, name, opening_balance')
      .single()
    check(
      'transaction owner can create an account',
      !accountRes.error && accountRes.data?.id === accountId,
      accountRes.error?.message,
    )

    const categoryRes = await a1.client
      .from('categories')
      .insert({ id: categoryId, name: 'Cloud test groceries', kind: 'expense', color: '#10b981' })
      .select('id, name')
      .single()
    check(
      'transaction owner can create a category',
      !categoryRes.error && categoryRes.data?.id === categoryId,
      categoryRes.error?.message,
    )

    const saved = await a1.client
      .from('transactions')
      .insert({
        id: transactionId,
        occurred_on: today,
        type: 'expense',
        amount: 187.5,
        category_id: categoryId,
        account_id: accountId,
        note: 'Cloud sync test',
      })
      .select('id, occurred_on, type, amount, note')
      .single()
    check(
      'transaction saves to Supabase',
      !saved.error && saved.data?.id === transactionId && Number(saved.data?.amount) === 187.5,
      saved.error?.message,
    )

    // -- Session A2, a brand-new client (page refresh / second device) --------
    const a2 = await signIn(EMAIL_A)
    const reload = await a2.client
      .from('transactions')
      .select('id, occurred_on, type, amount, note')
      .eq('id', transactionId)
      .maybeSingle()
    check(
      'a new session signing in loads the saved transaction',
      !reload.error && reload.data?.id === transactionId && reload.data.note === 'Cloud sync test',
      reload.error?.message ?? `loaded note “${reload.data?.note}”`
    )

    // -- A write from the second session is visible to the first ------------
    const fromSecond = await a2.client
      .from('transactions')
      .insert({
        id: randomUUID(),
        occurred_on: today,
        type: 'expense',
        amount: 42.25,
        category_id: categoryId,
        account_id: accountId,
        note: 'Written by session 2',
      })
      .select('id')
      .single()
    const seenByFirst = await a1.client
      .from('transactions')
      .select('id, note')
      .eq('note', 'Written by session 2')
    check(
      'a save from one session appears when the other session re-reads',
      !fromSecond.error && !seenByFirst.error && seenByFirst.data?.length === 1,
      fromSecond.error?.message ?? seenByFirst.error?.message,
    )

    // -- Duplicate submission: same id, second attempt ----------------------
    const duplicate = await a2.client
      .from('transactions')
      .insert({
        id: transactionId,
        occurred_on: today,
        type: 'expense',
        amount: 999.99,
        category_id: categoryId,
        account_id: accountId,
        note: 'Duplicate attempt',
      })
      .select('id')
    const duplicates = await a2.client.from('transactions').select('id').eq('id', transactionId)
    check(
      'retrying the same client-generated id is rejected instead of duplicating',
      Boolean(duplicate.error) &&
        (duplicate.error.code === '23505' || /duplicate key/i.test(duplicate.error.message)) &&
        duplicates.data?.length === 1,
      duplicate.error
        ? `rejected with ${duplicate.error.code}`
        : `insert unexpectedly succeeded; rows with id: ${duplicates.data?.length}`,
    )
    const original = await a2.client
      .from('transactions')
      .select('amount, note')
      .eq('id', transactionId)
      .single()
    check(
      'the retry did not overwrite the original row',
      !original.error &&
        Number(original.data?.amount) === 187.5 &&
        original.data?.note === 'Cloud sync test',
      original.error?.message ?? `amount ${original.data?.amount}, note “${original.data?.note}”`,
    )

    // -- Budgets are upserts, not duplicates --------------------------------
    const month = `${today.slice(0, 7)}-01`
    const budgetOne = await a1.client
      .from('budgets')
      .upsert(
        { category_id: categoryId, monthly_limit: 8000, month },
        { onConflict: 'user_id,category_id,month' },
      )
      .select('id, monthly_limit')
      .single()
    const budgetTwo = await a1.client
      .from('budgets')
      .upsert(
        { category_id: categoryId, monthly_limit: 9000, month },
        { onConflict: 'user_id,category_id,month' },
      )
      .select('id, monthly_limit')
      .single()
    const budgets = await a1.client
      .from('budgets')
      .select('id, monthly_limit')
      .eq('category_id', categoryId)
      .eq('month', month)
    check(
      'saving a budget twice updates one row',
      !budgetOne.error &&
        !budgetTwo.error &&
        budgets.data?.length === 1 &&
        Number(budgets.data[0].monthly_limit) === 9000,
      budgetOne.error?.message ?? budgetTwo.error?.message ?? `${budgets.data?.length} rows`,
    )

    // -- User B cannot reach any of it --------------------------------------
    const b = await signIn(EMAIL_B)
    check('user B signs in', b.userId === USER_B)

    check(
      'user B sees none of user A’s transactions',
      (await count(b.client, 'transactions')) === 0,
      'no rows returned',
    )
    check(
      'user B sees none of user A’s accounts',
      (await count(b.client, 'accounts')) === 0,
      'no rows returned',
    )

    const readOther = await b.client
      .from('transactions')
      .select('id, note, amount')
      .eq('id', transactionId)
    check(
      'user B cannot read user A’s transaction by id',
      !readOther.error && readOther.data?.length === 0,
      readOther.error?.message ?? 'returned 0 rows',
    )

    const updateOther = await b.client
      .from('transactions')
      .update({ note: 'hijacked' })
      .eq('id', transactionId)
      .select('id')
    check(
      'user B cannot update user A’s transaction',
      !updateOther.error && updateOther.data?.length === 0,
      updateOther.error?.message ?? 'changed 0 rows',
    )

    const deleteOther = await b.client
      .from('transactions')
      .delete()
      .eq('id', transactionId)
      .select('id')
    check(
      'user B cannot delete user A’s transaction',
      !deleteOther.error && deleteOther.data?.length === 0,
      deleteOther.error?.message ?? 'removed 0 rows',
    )

    const forgeOwner = await b.client
      .from('accounts')
      .insert({ user_id: USER_A, name: 'Forged account' })
      .select('id')
    check(
      'user B cannot insert a row owned by user A',
      Boolean(forgeOwner.error) &&
        (forgeOwner.error.code === '42501' || /row-level security|permission/i.test(forgeOwner.error.message)),
      forgeOwner.error?.code ?? 'insert unexpectedly succeeded',
    )

    const bCategory = await b.client
      .from('categories')
      .insert({ name: 'B only category', kind: 'expense', color: '#ef4444' })
      .select('id')
      .single()
    const crossReference = await b.client
      .from('transactions')
      .insert({
        occurred_on: today,
        type: 'expense',
        amount: 10,
        category_id: bCategory.data?.id,
        account_id: accountId,
      })
      .select('id')
    check(
      'user B cannot reference user A’s account',
      Boolean(crossReference.error) &&
        (crossReference.error.code === '23503' ||
          /foreign key|violates foreign/i.test(crossReference.error.message)),
      crossReference.error?.code ?? 'insert unexpectedly succeeded',
    )

    // -- A still sees exactly their own two rows ----------------------------
    check(
      'user A still sees both of their own transactions',
      (await count(a1.client, 'transactions')) === 2,
      '2 rows',
    )

    // -- Signed-out client gets nothing -------------------------------------
    const anon = session()
    const anonRead = await anon.from('transactions').select('id')
    check(
      'a client without a session is denied by RLS',
      Boolean(anonRead.error),
      anonRead.error?.code ?? 'read unexpectedly succeeded',
    )
  } finally {
    try {
      const deleted = await db.query(
        "delete from auth.users where email like 'cloud-sync-%@codebuff-test.dev' returning id",
      )
      results.push(`Cleanup removed ${deleted.rowCount} disposable test account(s).`)
      const leftovers = await db.query(
        "select count(*)::int as n from auth.users where email like 'cloud-sync-%@codebuff-test.dev'",
      )
      if (leftovers.rows[0].n !== 0) {
        failures++
        results.push(`FAIL  cleanup left ${leftovers.rows[0].n} test account(s) behind`)
      }
    } catch (error) {
      failures++
      results.push(`FAIL  cleanup: ${error.message}`)
    }
    await db.end().catch(() => {})
  }

  console.log(results.join('\n'))
  console.log(
    failures === 0
      ? '\nAll cloud persistence and isolation tests passed.'
      : `\n${failures} cloud test(s) FAILED.`,
  )
  return failures
}

main()
  .then((failures) => process.exit(failures === 0 ? 0 : 1))
  .catch((error) => {
    console.error('Cloud test could not run:', error.message)
    process.exit(1)
  })
