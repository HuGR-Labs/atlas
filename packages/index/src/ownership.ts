// @atlas/index — src/ownership.ts  (WP-2.9-a.INDEX — generated + reconciled ownership)
//
// INDEX-15 (atlas-index:83-91, 197-201; method-tags-idx:118-123), the anti-CODEOWNERS-rot reconciler.
// `reconcile(graph, blame, manifest)` GENERATES each territory's `owner` from the structural graph +
// git-blame authorship the index already holds, with the manifest as an OVERRIDE layer (an explicit
// manifest `owner` beats the generated one). Reconciliation is deterministic + `$0`-LLM; `tier` stays
// human-ratified (never generated — passed through on the key territory untouched); and the manifest is
// NOT the sole source — a territory evidenced by blame but unlisted still resolves an owner. `git-blame`
// is a BLACK-BOX signal (`BlameEntry`, refuse-to-model), never ownership ground truth. Owner-generation
// is the DEFINE-parametric ENABLED case (REQ-INDEX-15a SHOULD/[NEEDS RECONCILIATION]); the MUST clauses
// 15b-15e hold regardless.

import type { Territory } from '@atlas/contracts';
import type { DepEdge, Manifest } from '../ref/types.js';
import type { OwnerMap, BlameEntry } from '../ref/ownership.js';
import { pathMatchesGlob } from './territory.js';

// Reconciliation is pure — it NEVER consults a model (INDEX-15c). SCN-INDEX-15c-1 witness: statically 0.
const RECONCILE_MODEL_CALLS = 0;
export const reconcileModelCalls = (): number => RECONCILE_MODEL_CALLS;

const dirname = (p: string): string => {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
};

/**
 * The generated owner from git-blame authorship: the majority author across the territory's blame entries,
 * deterministic (lexical tiebreak). `graph` is the structural co-signal accepted per the frozen INDEX-15
 * contract ("generated from the structural graph + git-blame"); under the frozen inputs its edges are
 * `Hash→Hash` with no author projection, so it cannot refine the blame majority — it is threaded through,
 * not invented into a fabricated owner. Returns `''` when there is no blame evidence.
 */
const generatedOwner = (entries: readonly BlameEntry[], graph: readonly DepEdge[]): string => {
  void graph; // structural co-signal (no author projection under the frozen inputs) — see doc above.
  const tally = new Map<string, number>();
  for (const e of entries) for (const a of e.authors) tally.set(a, (tally.get(a) ?? 0) + 1);
  let winner = '';
  let bestN = -1;
  for (const author of [...tally.keys()].sort()) {
    const n = tally.get(author)!;
    if (n > bestN) {
      winner = author;
      bestN = n;
    }
  }
  return winner;
};

/**
 * Reconcile territory ownership (INDEX-15). Deterministic, `$0`-LLM. For each manifest territory: owner =
 * explicit override if present, else generated from blame; `tier` on the key is the ratified manifest tier
 * (never generated). Blame paths NOT claimed by any manifest glob are grouped by governance zone into
 * generated (unlisted) territories — the manifest is not the sole source. `Territory` object keys are
 * reference-stable (the manifest's own objects for listed territories).
 */
export function reconcile(
  graph: readonly DepEdge[],
  blame: readonly BlameEntry[],
  manifest: Manifest,
): OwnerMap {
  const map = new Map<Territory, string>();
  const claimed = new Set<string>();

  // 1. manifest territories — override beats generated; ratified tier passed through untouched (on the key).
  for (const t of manifest.territories) {
    const mine = blame.filter((b) => t.globs.some((g) => pathMatchesGlob(b.path, g)));
    for (const b of mine) claimed.add(b.path);
    map.set(t, t.owner !== '' ? t.owner : generatedOwner(mine, graph));
  }

  // 2. generation ENABLED (INDEX-15a/15e) — territories evidenced by blame but unlisted, grouped by zone.
  const groups = new Map<string, BlameEntry[]>();
  for (const b of blame) {
    if (claimed.has(b.path)) continue;
    const zone = dirname(b.path);
    const bucket = groups.get(zone) ?? [];
    bucket.push(b);
    groups.set(zone, bucket);
  }
  for (const zone of [...groups.keys()].sort()) {
    const entries = groups.get(zone)!;
    // synthesized (ungoverned) key: tier defaults to the least-critical T2 — a structural placeholder, NOT
    // a generated criticality claim (INDEX-15d guards manifest-ratified tiers; unlisted zones have none).
    const synth: Territory = { name: zone, owner: '', tier: 'T2', globs: [`${zone}/**`] };
    map.set(synth, generatedOwner(entries, graph));
  }
  return map;
}
