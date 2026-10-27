/**
 * Registers scripts/ts-hook.mjs with node's module loader.
 * Usage:  node --import ./scripts/register-hooks.mjs --test <files…>
 */
import { register } from 'node:module'

register('./ts-hook.mjs', import.meta.url)
