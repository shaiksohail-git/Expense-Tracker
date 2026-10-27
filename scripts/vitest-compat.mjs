/**
 * vitest → node:test compatibility shim.
 *
 * The app's unit tests import { describe, expect, it } from 'vitest' and test
 * pure functions only, but `vitest` needs `vite`, whose bundling engine
 * (rolldown) cannot run on every host. This shim lets `node --test` execute
 * the same test files unchanged.
 *
 * Only loaded when the node test runner is used (see scripts/ts-hook.mjs).
 * Supports the matchers this project's tests use.
 */
import { deepStrictEqual } from 'node:assert/strict'
import { describe, it } from 'node:test'
import { inspect } from 'node:util'

export { describe, it }

function fmt(value) {
  return typeof value === 'string' ? JSON.stringify(value) : inspect(value, { depth: 6 })
}

function fail(label, actual, expected, extra = '') {
  throw new Error(
    `${label}\n      actual:   ${fmt(actual)}\n      expected: ${fmt(expected)}${extra}`,
  )
}

/** Subset comparison for toMatchObject. */
function matchesSubset(actual, expected) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length < expected.length) return false
    return expected.every((item, i) => matchesSubset(actual[i], item))
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return false
    return Object.entries(expected).every(([key, value]) =>
      matchesSubset(actual[key], value),
    )
  }
  return actual === expected
}

function makeAssertions(actual, negated) {
  const assert = (result, label, expected) => {
    if (!negated) {
      if (!result) fail(label, actual, expected)
    } else if (result) {
      fail(`${label} — negated (.not) but held`, actual, expected)
    }
  }

  return {
    get not() {
      return makeAssertions(actual, !negated)
    },
    toBe(expected) {
      assert(Object.is(actual, expected), 'toBe', expected)
    },
    toBeUndefined() {
      assert(actual === undefined, 'toBeUndefined', undefined)
    },
    toBeDefined() {
      assert(actual !== undefined, 'toBeDefined', undefined)
    },
    toBeNull() {
      assert(actual === null, 'toBeNull', null)
    },
    toBeTruthy() {
      assert(Boolean(actual), 'toBeTruthy', undefined)
    },
    toBeFalsy() {
      assert(!actual, 'toBeFalsy', undefined)
    },
    toBeGreaterThan(n) {
      assert(typeof actual === 'number' && actual > n, 'toBeGreaterThan', n)
    },
    toBeGreaterThanOrEqual(n) {
      assert(typeof actual === 'number' && actual >= n, 'toBeGreaterThanOrEqual', n)
    },
    toBeLessThan(n) {
      assert(typeof actual === 'number' && actual < n, 'toBeLessThan', n)
    },
    toBeLessThanOrEqual(n) {
      assert(typeof actual === 'number' && actual <= n, 'toBeLessThanOrEqual', n)
    },
    toBeCloseTo(expected, precision = 2) {
      assert(
        Math.abs(actual - expected) < Math.pow(10, -precision) / 2,
        'toBeCloseTo',
        expected,
      )
    },
    toHaveLength(length) {
      assert(actual?.length === length, 'toHaveLength', length)
    },
    toContain(needle) {
      let result
      if (typeof actual === 'string') result = actual.includes(needle)
      else if (Array.isArray(actual)) result = actual.includes(needle)
      else if (actual instanceof Set) result = actual.has(needle)
      else result = false
      assert(result, 'toContain', needle)
    },
    toEqual(expected) {
      const ok =
        actual === expected ||
        (actual !== null &&
          expected !== null &&
          typeof actual === 'object' &&
          typeof expected === 'object' &&
          (deepStrictEqual(actual, expected), true))
      assert(ok, 'toEqual', expected)
    },
    toMatch(expected) {
      const ok =
        String(actual).match(
          typeof expected === 'string' ? new RegExp(expected) : expected,
        ) !== null
      assert(ok, 'toMatch', expected)
    },
    toMatchObject(expected) {
      assert(matchesSubset(actual, expected), 'toMatchObject', expected)
    },
    toHaveProperty(path, value) {
      const parts = Array.isArray(path) ? path : String(path).split('.')
      let cur = actual
      for (const part of parts) {
        if (cur == null || typeof cur !== 'object') break
        cur = cur[part]
      }
      if (arguments.length > 1) assert(cur === value, 'toHaveProperty', value)
      else assert(cur !== undefined, `toHaveProperty(${String(path)})`, undefined)
    },
    toThrow(expected) {
      let thrown
      try {
        actual()
      } catch (error) {
        thrown = error
      }
      let ok = Boolean(thrown)
      if (ok && expected) {
        const message = thrown.message ?? String(thrown)
        ok =
          typeof expected === 'string'
            ? message.includes(expected)
            : typeof expected === 'function'
              ? thrown instanceof expected
              : expected.test(message)
      }
      assert(ok, 'toThrow', expected)
    },
  }
}

export function expect(actual) {
  return makeAssertions(actual, false)
}
