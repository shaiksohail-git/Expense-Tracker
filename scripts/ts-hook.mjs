/**
 * The node test runner needs two things vitest's own settings normally do:
 *   1. `import { describe, expect, it } from 'vitest'` remapped to the shim in
 *      scripts/vitest-compat.mjs.
 *   2. Extension-less relative imports ('./finance') resolved to .ts files,
 *      because Node's TypeScript type-stripping requires explicit extensions.
 *
 * Registered from scripts/register-hooks.mjs.
 */
import { pathToFileURL } from 'node:url'

const shimUrl = String(new URL('./vitest-compat.mjs', import.meta.url))

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'vitest') {
    return { url: shimUrl, shortCircuit: true }
  }
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    const relative =
      specifier.startsWith('./') ||
      specifier.startsWith('../') ||
      specifier.startsWith('/')
    if (error && (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'ERR_UNSUPPORTED_RESOLVE') && relative) {
      for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
        try {
          return await nextResolve(specifier + suffix, context)
        } catch {
          // try the next suffix
        }
      }
    }
    throw error
  }
}

// Silence an unused import; kept for future debugging of resolution.
export const toFilePath = (url) => pathToFileURL(url)
