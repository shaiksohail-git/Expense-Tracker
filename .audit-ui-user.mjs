/** Temporary audit helper: creates one confirmed, disposable auth user. */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const ROOT = path.resolve(import.meta.dirname)
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    }),
)
const dbPassword = fs
  .readFileSync(path.join(ROOT, '.supabase-db-password.txt'), 'utf8')
  .trim()
const projectRef = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]

const stamp = Date.now()
const email = `audit-ui-${stamp}@codebuff-test.dev`
const password = `audit-ui-password-${stamp}`
const userId = randomUUID()

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
  await db.query("delete from auth.users where email like 'audit-ui-%@codebuff-test.dev'")
  await db.query(
    `insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        $1::uuid, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
        $2::text, extensions.crypt($3::text, extensions.gen_salt('bf')), now(),
        '', '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        now(), now()
      )`,
    [userId, email, password],
  )
  await db.query(
    `insert into auth.identities (
        user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
      ) values ($1::uuid, $2::text, 'email',
        jsonb_build_object('sub', $1::text, 'email', $2::text), now(), now(), now())`,
    [userId, email],
  )
  console.log(JSON.stringify({ email, password }))
} finally {
  await db.end()
}
