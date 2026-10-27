import { defineConfig } from 'vitest/config'

/**
 * Unit tests only. `supabase/tests/*.mjs` are standalone scripts that talk to
 * the live project and are run with `npm run test:rls` / `npm run test:cloud`;
 * they are not Vitest suites and would otherwise fail the run.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
