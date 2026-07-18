// @atlas/retrieval — ref/poke.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Debounced, once-per-scope poke on scope-entry (RETR-4). A poke fires iff a single-file navigation
// signal SETTLES as the current scope across a debounce window of `N = 2` consecutive tool calls AND
// that scope was not already poked this session (≤1 poke / scope / session). The event source is the
// harness tool-call hook; scope is inferred from the paths in the navigator's tool calls. Scope-signal
// filter: a single-file `Edit`/`Read`/`Write` IS navigation; a multi-file `Grep`/`Glob` has no single
// scope (suppressed); a `Bash` path-shaped arg is NOT navigation. Transient in-and-out crossings fire 0
// pokes. The debounce is over a COUNT of calls, not wall-clock — nothing real-time. Total: no covering
// knowledge ⇒ `null`, never a throw (RETR-9). Transcribed from atlas-retrieval:171 +
// method-tags-ret:42-47.

import type { Path, Poke } from './types.js';

// The settle window (RETR-4) is frozen at N = 2 (atlas-retrieval:89; method-tags-ret:46): a scope change
// must remain the current scope across 2 consecutive tool calls before its poke fires. Kept as a doc
// constant only — ref/*.ts is zero-runtime, so no value is exported here (the owning WP binds it).

export interface PokeApi {
  /** Scope-entry push (RETR-4): returns the scope's `Poke` iff a single-file navigation signal settles
   *  across the `N = 2` debounce window and the scope was not already poked this session; else `null`.
   *  Pure + total (no covering knowledge / malformed scope ⇒ `null`, no throw — RETR-9).
   *  (atlas-retrieval:171) */
  poke(scope: Path): Poke | null;
}
