// @atlas/adapter-io — src/store-provenance.ts  (WHERE the durable store came from, not what it contains)
//
// Every other guard in this package decides what a WRITE may do. This one decides whether the thing the
// doors are reading is a durable store AT ALL, or a document somebody committed.
//
// ── THE HOLE ─────────────────────────────────────────────────────────────────────────────────────────────
// `.atlas/projection.json` and `.atlas/cas/**` are ordinary files in an ordinary working tree. A repository
// can SHIP them. One landed commit publishes rows carrying any `nodeKey`, any `scope`, any `tier` and any
// `contentHash`, plus the CAS blobs they point at — and NO DOOR IS INVOLVED, so there is nothing for the
// truth gate, the authz gate, the incumbent gate, the ratify gate or the tier lattice to refuse. Reproduced
// end to end in `test/store-provenance.test.ts`: with `authz.scopes = {}` (the fail-closed default, under
// which every write door denies every write), a committed projection is served as a ratified `T0` pack
// invariant. `pack-shape.ts` already names this entry point in its own header; this module closes it.
//
// ── WHY `.gitignore` IS NOT THE CONTROL ──────────────────────────────────────────────────────────────────
// `.gitignore` denies `.atlas/*` (landed in `482c68c`) and that line is worth keeping: it stops the ACCIDENT,
// which is the common case and the one that costs a real team real time. It is not a control against an
// adversary. `git add -f` overrides it in one flag, and the result is a file in a commit that reads exactly
// like every other file in that commit. This repo has already been bitten twice by the same shape — a check
// the caller must remember is not a control — and a `.gitignore` line is that pattern with the committer as
// the caller.
//
// ── WHY "CONTENT-VERIFICATION ON LOAD" IS NOT THE CONTROL EITHER ─────────────────────────────────────────
// This is the part worth being precise about, because it is the natural fix and it does not work.
//
// The store ALREADY content-verifies, thoroughly: `store.get` re-hashes every CAS object and serves
// `undefined` unless `id(bytes)` equals the key it was fetched by (store.ts, the tamper-safe read), and the
// emit door's ADR-0007 corroboration gate additionally requires a row's `scope` to AGREE with its own stored
// bytes. Both of those pass for a committed store, and they pass BY CONSTRUCTION: the attacker who writes
// the file also computes the hashes, with the product's own `id()`, exactly as a door would. The regression
// fixture does precisely that in ~5 lines.
//
// Content-addressing authenticates INTEGRITY — "these bytes are the bytes this hash names". The question
// here is PROVENANCE — "did a governed door decide these bytes may be here". No amount of hashing answers it,
// because hashing is not keyed: there is no secret an attacker lacks. The only content-verification that
// WOULD answer it is an authenticated one (a MAC or signature over the projection under a key the committer
// does not hold), and this product has no key material, no key distribution, and nowhere to put a key that a
// committer could not also read. Building a fake one — a "signature" everyone can compute — would be strictly
// worse than this module: it would LOOK like authentication in every review that followed.
//
// ── WHAT IS ACTUALLY BUILT ───────────────────────────────────────────────────────────────────────────────
// A provenance tripwire, and it is deliberately the cheap, total, unforgeable question: IS THE DURABLE STORE
// TRACKED BY GIT? A door writes it to the working tree and never stages it. A commit is the ONLY way it
// becomes tracked. So `git ls-files` separates the two populations exactly, with no heuristics — and, unlike
// `.gitignore`, it is not weakened by `-f`: `-f` is what puts the file in the index, which is the very thing
// being detected. The attacker's one flag is what trips the wire.
//
// FAIL-CLOSED ON DETECTION, and routed through machinery that already exists: a tripped wire makes the read
// resolve to "nothing readable", so reads serve NOTHING (never the forged rows) and writes take the existing
// `settled:false` refusal path rather than upserting into an empty store and persisting — which is the leg-2
// amplifier `sidecar.ts` documents, and would here also LAUNDER the attacker's file into a door-produced one
// and destroy the evidence.
//
// THE SEAM IS INJECTED, NOT IMPORTED. `store.ts` is deliberately git-ignorant ("the store stays git-ignorant"
// — its own header); `compose.ts` owns git and already injects the N11 `headSha` watermark the same way. So
// this is a second seam of the same shape, absent in tests and non-git trees, which is also why every
// existing suite is unaffected: no seam ⇒ no check ⇒ the pre-existing behaviour, unchanged.

import { runGit } from './run-git.js';

/** "May the durable sidecar be trusted?" — `false` iff it demonstrably arrived by COMMIT rather than through
 *  a door. Absent (tests, non-git trees) ⇒ never consulted ⇒ the pre-existing behaviour. */
export type SidecarTrust = () => boolean;

/** Is `p` (a repo-relative, forward-slash git path) part of the DURABLE STORE — the sidecar families and the
 *  CAS? Deliberately NOT "anything under `.atlas/`": `policy.json` is admin-owned source and MUST stay in
 *  git (that is the whole point of the policy lock), so a broad rule would fire on every healthy repo and be
 *  turned off within a day. Matches the two sidecar FAMILIES by their generation-naming (`sidecar.ts`
 *  `genPath`/`mirrorPath`) and the whole CAS subtree. */
export function isDurableStorePath(p: string): boolean {
  if (p.startsWith('.atlas/cas/')) return true;
  const m = /^\.atlas\/(projection|staging)(\.\d{1,15})?\.json$/.exec(p);
  return m !== null;
}

/**
 * The git-backed provenance seam for a repo. Returns a MEMOIZED predicate: the question is asked at most
 * once per composed runtime (the answer cannot change under a running process without a commit, and a
 * `git ls-files` per query would be paid on every read).
 *
 * TOTAL. `runGit` throws for a non-repo, an absent git, or any exec failure; all of those mean "git cannot
 * tell us", and the honest answer to "did this arrive by commit" is then "no evidence that it did" ⇒ trusted.
 * That is a real, stated limit rather than a hidden one: a store shipped in a TARBALL (no git anywhere) is
 * not detected by this check, and nothing here claims otherwise.
 *
 * `-z` is not a detail: git quotes and escapes unusual pathnames in its default output, and a NUL-delimited
 * listing split in-process is the only form that survives a filename containing a newline or a quote.
 */
export function gitSidecarTrust(repoPath: string): SidecarTrust {
  let cached: boolean | undefined;
  return () => {
    if (cached !== undefined) return cached;
    let out: string;
    try {
      out = runGit(repoPath, ['ls-files', '-z', '--', '.atlas']);
    } catch {
      cached = true; // no git / not a repo ⇒ no evidence of a commit ⇒ unchanged behaviour
      return cached;
    }
    const tracked = out.split('\0').filter((p) => p.length > 0);
    cached = !tracked.some(isDurableStorePath);
    return cached;
  };
}
