# Atlas E2E — exhaustive black-box coverage matrix (functional-surface method)

> Built via the repo's `functional-surface` (L0–L3 + 6 lenses + closure predicates) + a 3-agent
> exhaustive surface recon. Goal: every user-facing behavior × direction × edge has a black-box (`atlas`
> bin / `atlas-mcp` stdio) test — OR is an explicit, documented non-behavior. `[BB]`=covered by
> e2e-blackbox s1–s5; `[gap]`=works, no BB test; `[FINDING]`=behavior wrong/unreachable → fix-or-document.

## New FINDINGS the enumeration surfaced (beyond coverage)
- **N1 `--accept-reground` is a NO-OP** — `tools/src/reconcile.ts:84-87` voids the option, `regroundedCount=0` always. The flag does nothing. → fix (wire the reground-accept path) OR document as unimplemented.
- **N2 `byDependency` / `byTrigger` unreachable end-to-end** — `RetrievalApi` (`index/src/retrieval.ts:81-89`) is never constructed in `wire.ts`; `atlas query` only does scope resolution. 2 of 3 retrieval modes are dead-to-users (echoes the subsumes-unreachable finding). → wire them OR document scope-only.
- **N3 `loadProjection` THROWS on corrupt `projection.json`** — `store.ts:131` `JSON.parse` unwrapped, violating the total-`undefined` contract `get` honors (`store.ts:99`). **Genuine totality bug.** → fix (total-undefined).
- **N4 corrupt-but-present SCIP throws** through `composeRuntime` — `scip.ts:43` guards only MISSING; a corrupt `.scip` `deserializeSCIP`-throws. → fix (fail-closed to empty) OR document.
- **N5 `--depth` is a DEAD flag** — validated (`parse.ts:100`), read by no leg. → wire OR remove.
- **N6 `resolveNode` / `poke` / transport-resolve not user-reachable** — exist as library surface, no CLI/MCP door. → document (likely orchestrator-owned) OR expose.
- **N7 tier-ratification NOT composed into the emit door (governance hole)** — the governed emit door (`governed-emit.ts`, `wire.ts:153`) is truth→authz→upsert ONLY; the ratify/fastpath machinery (`knowledge/src/ratify/{ratify,fastpath}.ts`: T0→human+billy, fast-path T2-advisory) is NEVER composed into `atlas emit`. So a T0 fact bypasses the human+billy gate at the actual write door. → fix (compose ratify into the door) OR document (ratification is orchestrator/genesis-owned, upstream of emit). **Highest-risk finding.**

> **SEVERITY: N3 + N4 are BOOT-CRASHERS** — a corrupt `.atlas/projection.json` (`compose.ts:137`) or a corrupt-present `.atlas/index.scip` (`compose.ts:128`) throws through `composeRuntime`, crashing BOTH bins at startup (not just the read path). Total-failure, not a degraded read. Must-fix.

## Coverage matrix — the cells (grouped into remediation waves)

### WAVE-COV-1 — write/read matrix (the core knowledge behaviors)
| cell | now | action |
|---|---|---|
| predicate facts: CREATE + SUPERSEDE lineage | `[gap]` (advisory-only BB) | BB story: emit a predicate, re-evidence → SUPERSEDE, query |
| check-engine per-op: index-query {exists/absent/has-object}, assertion {child-count/subtree-hash}, unrecognized→NA | `[gap]` (unit only) | BB per op + the fail-closed NA |
| grounding-kind axis: symbol/file/block/repo/project — gate/drift per kind (only symbol enters nodeKey) | `[gap]` | BB across kinds |
| `query byDependency` / `byTrigger` | `[FINDING N2]` | wire+BB, or document |
| pack `stale:true` rendered (a DRIFTED fact) | `[gap]` | BB story: emit → drift → query shows `stale: true` |
| pack `tokenEstimate` / ~2K budget | `[gap]` | BB story asserting the budget bound |
| `underScope` segment boundary (`sr`⊄`src`) | `[gap]` | BB story: out-of-scope-by-segment fact excluded |
| `cover` miss → rejected verdict (unknown scope) | `[gap]` | BB story: `query nonesuch` → rejected, total |

### WAVE-COV-2 — doctor + reconcile lifecycle
| cell | now | action |
|---|---|---|
| `doctor archive [scope]` (lineage chain) | `[gap]` | BB |
| `doctor reground <fact>` (proposal, persists nothing) | `[gap]` | BB: proposes, `.atlas/cas` unchanged |
| doctor CLI totality (unknown sub / missing arg) | `[gap]` | BB: exit≠0 structured |
| `--accept-reground` | `[FINDING N1]` | fix-or-document + BB |
| stale→reground convergence | `[gap]` | BB |

### WAVE-COV-3 — governance (authz / policy / tier-ratify)
| cell | now | action |
|---|---|---|
| authz positive branches (`actorInScope` listed/absent) | `[gap]` | BB via scoped policy |
| policy prototype-pollution hardening (`__proto__`) | `[gap]` | BB: malicious policy → defaults, no pollution |
| tier: T0-keyword flags but never auto-promotes; T0 needs billy | `[FINDING N7]` | ratify NOT composed into emit door — fix-or-document, then BB |
| fastpath auto-accept (grounded∧T2∧advisory) vs full-ratify | `[FINDING N7]` | same — unreachable at the write door |

### WAVE-COV-4 — edge / error / totality
| cell | now | action |
|---|---|---|
| corrupt `projection.json` | `[FINDING N3 — bug]` | FIX total-undefined + BB |
| corrupt present SCIP | `[FINDING N4]` | fix-or-document + BB |
| non-git repo → deny (empty actor) | `[gap]` | BB |
| empty/fresh repo → files-only, no throw | `[BB]` s1 partial | BB explicit |
| re-init / idempotency | `[gap]` | BB |
| unknown tool / malformed args (both doors) | `[BB]` s5 partial | BB explicit |
| `--depth` | `[FINDING N5]` | wire-or-remove |

### WAVE-COV-5 — transports / memory / mine / provenance
| cell | now | action |
|---|---|---|
| `mine` CLI command (abstain-by-design line, exit) | `[gap]` (in-proc only) | BB |
| poke transport | `[FINDING N6]` | document/expose + BB if reachable |
| memory per-seat scoping + recall explicit-only | `[gap]` (in-proc s07) | BB if a user door exists; else document |
| hits ledger / decay / door-2 | `[gap]` | BB if observable; else unit-owned |
| provenance/dossier via `doctor why` blame | `[gap]` | BB |

## Closure predicates (functional-surface gate) — status
- [~] Actor×Goal matrix — actors: human-CLI, agent-MCP, orchestrator-poke, time/git-event (drift). human-CLI + agent-MCP full; **orchestrator-poke column is EMPTY at the user surface (N6 unreachable)** → not [x].
- [x] doctor `hotset <budget>` (size/budget/over) — `[BB]` covered (s4 + harness.smoke); listed for the ledger.
- [~] Every user-goal use case has Extensions enumerated — **done for the covered goals; the `[gap]` cells above ARE the un-interrogated extensions** (this matrix IS that enumeration).
- [x] Every kite decomposes / every fish rolls up — no orphan behavior found.
- [~] Every backbone activity re-walked per persona — CLI + MCP walked; **poke/orchestrator persona = N6 (not user-reachable)**.
- [x] Every event has producer + consumer — drift(git-event)→reconcile/doctor; emit→projection→query.
- [x] Every entity CRUD — fact: Create(emit)/Read(query)/Update(D1)/supersede(archive)/List(query pack); policy: read-only input; projection: internal.
- [~] Loop-until-dry — this pass surfaced N1–N6 + ~24 cells; **a completeness-critic pass is the gate before slicing** (below).

## Plan
5 coverage waves (disjoint story files per area) + the 6 findings folded in (fix-or-document per the same doctrine). Cold-critic THIS matrix for completeness first (nothing missed), then fan out ≤6.
