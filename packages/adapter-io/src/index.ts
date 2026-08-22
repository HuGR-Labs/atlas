// @atlas/adapter-io — barrel
//
// The raw adapters (constitution D2: "fs · scip · ast · store · git · llm") + the ring types they introduce
// (LangId / IndexerPlan / CasPath / DiskStore). The `git` seam is split into its three separately-anchored
// WP files (git-history · git-drift · git-forge) so ADAPT-GIT-1/2/3 stay disjoint per the frozen WP cards.
// One-way DAG leaf: nothing in the core imports this.

export { walkFileTree } from './fs.js';
export { readScip, readScipOrEmpty, planIndexers, HONEST_HOLE, SCIP_INDEX_REL } from './scip.js';
export type { LangId, IndexerPlan } from './scip.js';
// The `atlas doctor index` diagnosis (the PRODUCTION caller of `planIndexers`, which had none). Atlas plans
// the per-language SCIP index and prints the command; the OPERATOR runs it. Nothing here spawns a process.
export { reportIndexPlan } from './indexer-report.js';
export type { IndexPlanReport, PlannedLang, ScipState } from './indexer-report.js';
export { foldAstUnits, foldAstUnitsWithPriors, initAst, astWarmed } from './ast.js';
export { createDiskStore, rehydrateProjection } from './store.js';
export type { CasPath, DiskStore } from './store.js';
// The durable-sidecar seam the two governed doors commit through. Exported because `DiskStore.commitProjection`
// is part of the store's public shape: a consumer (the `mine` driver is the next one — see `commitStaging`)
// cannot write a `decide` callback without naming these. The commit PROTOCOL itself stays module-internal.
export type { CommitDecision, CommitRefusal, CommitResult } from './sidecar.js';
export { createHistorySource } from './git-history.js';
export { createDriftSource } from './git-drift.js';
// The merge-gate refusal `driftAt` raises when the base it was handed names no commit. Exported so a consumer
// can recognise it as a VALUE (`instanceof` / `.name`) rather than by matching the reason prose — an empty
// drift set used to be the only thing this condition could say, which is a green merge gate.
export { UnresolvableMergeBaseError } from './git-drift.js';
export { createForge } from './git-forge.js';
// The cheap `headSha` freshness-watermark reader (N11, no worktree) — the ONLY member of the shared no-shell
// git seam (#74, `run-git.ts`) that crosses the package boundary (the mine driver injects it). `runGit` + the
// error classifier/backoff primitives stay module-internal, consumed intra-package via relative import.
export { headSha } from './run-git.js';
export { createSiteProposer, advisoryClaimParser, makeDependencyClaimParser, DEP_UNPARSEABLE_REASON, makeCountClaimParser, COUNT_UNPARSEABLE_REASON, gotchaClaimParser, GOTCHA_NO_DERIVATION_REASON } from './llm.js';
export type { ClaimParser, DepResolver, CountResolver } from './llm.js'; // ADR-0017 — the per-arm claim→seed parser seam + #196a/#196c resolvers
// ADR-0011 D1 — the one concrete model adapter (an operator-supplied command). The port's own type name
// is deliberately NOT written here: golden 11a audits it TEXTUALLY across `packages/*/src`, so keeping
// the name in exactly one file is a stronger property than 'only one importer', and worth the terseness.
export { createCommandClient, ModelCommandError } from './llm.js';
export type { ModelCommand, ModelFailure } from './llm.js';
// The candidate-sidecar write door's fail-closed floor: a decision naming a CAS object the store cannot
// address (#136/#140). Exported so a caller that catches it by class — the CLI `mine` catch re-files it as a
// governed refusal (`cli.ts`), mirroring `ModelCommandError` above — tests against the real error, not a copy.
export { UnaddressableCasObjectError } from './sidecar-commit.js';
export { loadModelConfig, modelConfigPath, ModelConfigError } from './model-config.js'; // ADR-0011 D2
export type { ModelConfig, ModelRole } from './model-config.js';
export {
  createPromptFactory,
  createFileSourceReader,
  shippedTemplatePath,
  shippedEnrichedTemplatePath, // ENRICH arm (A4-LEVER) — the {{RELATED}}-bearing template
  shippedDependencyTemplatePath, // ADR-0017 dependency arm — the DEPENDS-ON prompt
  shippedCountTemplatePath, // #196c count arm — the COUNT prompt
  shippedGotchaTemplatePath, // 196b gotcha arm — the justified {claim, derivation} prompt
  PromptError,
} from './prompt.js'; // ADR-0011 D3
export type { PromptFactory, SourceReader, SiblingReader, RelatedUnit, CandidateReader } from './prompt.js';
export { createUnitSourceReader, createUnitSiblingReader } from './unit-source.js'; // #182 S2 — unit bytes + ENRICH siblings
export { createUnitDepCandidates, createDepResolver } from './unit-candidates.js'; // #196a — candidate-grounded dep names (prompt) + per-unit name→symbol resolver (gate)
export { createUnitCountCandidates, createCountResolver } from './unit-count-candidates.js'; // #196c — externally-called export names (prompt) + per-unit name→symbol+count resolver (gate)
export { createIndexAdapter } from './index-adapter.js';
export type { IndexAdapterDeps, IndexAdapterSurface } from './index-adapter.js'; // IndexAdapterSurface: #99b N0 symbol-reverse seam for N2
export { materializePoke, pokeFilePath, POKE_FILE_EXT } from './poke-file.js';

// The standalone arbitrary-rev code index (COMPOSE-C) — builds `Axes` at any git rev via a memoized,
// self-cleaning temp worktree so `atlas-reconcile` can detect real (non-HEAD) drift. Wiring is separate.
export { createRevIndex, type RevIndex } from './rev-index.js';

// The PRODUCTION genesis S0 seam (GEN-1): the frozen `SkeletonSource` satisfied by COMPOSING walkFileTree +
// readScipOrEmpty + @atlas/index `build` + the index-adapter/`atlas-init` territory move-in. Consumed by the
// `atlas mine` driver, which previously injected a hand-built empty skeleton (⇒ 0 seeds, 0 sites, 0 calls).
export { createSkeletonSource } from './skeleton-source.js';
export type { SkeletonSourceDeps, ProductionSkeletonSource } from './skeleton-source.js';

// The ONE shared handler assembly (constitution WIRE-1) — consumed by every entrypoint (CLI, MCP).
export { assembleHandler } from './wire.js';
export type { WireConfig, WiredHandler, WireSeams } from './wire.js';

// The governed durable emit leg (COMPOSE-A) + the runtime composition root that supplies the real seams.
export { createGovernedEmit } from './governed-emit.js';
export type { GovernedEmitDeps } from './governed-emit.js';
// The governed sameAs link leg (WP-SAMEAS) — the second governed write door (authz + ratifier). `LinkOut` is
// re-exported FROM @atlas/tools (its owner) so consumers can pull the whole door surface from this barrel.
// The governed PROMOTION leg (KNOW-8): staging → knowledge THROUGH the emit door. NOT new governed surface —
// it publishes only via `createGovernedEmit`, so `GOVERNANCE_SURFACE`/`WRITE_PATHS` are untouched (ADR-0008).
// The two per-row refusal texts are exported as CONSTANTS for the same reason the link door's are: a test and
// an embedder must compare a refusal by EQUALITY on a named value, never by matching a substring of prose.
export { createGovernedPromote, REJECTED_CANDIDATE_UNREADABLE, REJECTED_DEGENERATE_CANDIDATE } from './governed-promote.js';
export type { GovernedPromoteDeps, PromoteOut, PromotedRow } from './governed-promote.js';
export { createGovernedLink } from './governed-link.js';
export type { GovernedLinkDeps } from './governed-link.js';
export type { LinkOut } from '@atlas/tools';
// [A-D3 / task #83] the RETRACTION MODE's refusal vocabulary. Its DISCRIMINANTS are exported for the same
// reason `UntrustedStoreError.reason` is (see below): a test — and an embedder — must be able to compare a
// refusal by EQUALITY on a named value, never by matching a substring of prose. These refusal texts quote
// each other's concepts, and substring assertions on this surface have been one-directionally blind before.
export {
  ALREADY_RETRACTED_REASON,
  NOT_LINKED_REASON,
  RETRACTED_PAIR_REASON,
  RETRACT_ALREADY_RETRACTED,
  RETRACT_NOT_LINKED,
  RETRACT_RETRACTED_PAIR,
} from './governed-link-retract.js';
export { composeRuntime, buildHeuristic, buildGate, buildMineAdmission } from './compose.js';
export type { ComposedRuntime, MineAdmission, Reground } from './compose.js';
// The `own_<scope>` READ leg (RETR-12) — the production feed that gives `@atlas/retrieval`'s `createOwn` its
// first caller outside its own test file. Exported because the CLI entrypoint threads it on the same injected
// seam `promote` rides, and because a test must be able to drive the FEED (`buildOwnSources`) directly rather
// than only through the composed runtime. It opens no governed surface: it is a read.
export { buildOwnSources, createOwnLeg } from './own-source.js';
export type { OwnDispatch, OwnLeg, OwnSourceDeps } from './own-source.js';
export { createDoctorSource, regroundTemplate, retireTemplate } from './doctor-source.js';
// The grounded-relation READ leg (#99a) — the production edge for `relationsOf`, plus the SHARED verdict
// builder both transports drive for byte-identical SCHEMA + VERDICT parity. It opens no governed surface: a read.
export { createRelationLeg, relationsVerdict } from './relation-source.js';
export type { RelationLeg, RelationsData } from './relation-source.js';
// The grounded-negation + abstention READ leg (#99b) — the production edge for `negationsOf`/`abstentionsOf`,
// plus the SHARED verdict builder both transports drive. Read-only, opens no governed surface; the #202 close.
export { createNegationLeg, negationsVerdict } from './negation-source.js';
export type { NegationLeg, NegationsData, NegationsRead } from './negation-source.js';
// The sound-genesis PROVEN family's production feed + shared verdict — the ONE caller that makes
// verify{Dependency,Count,Negation} (@atlas/genesis) running code rather than ledgered reference models.
export { createVerifyFactLeg, verifyFactVerdict } from './verify-fact-source.js';
export type { VerifyFactLeg, VerifyFactData, VerifyFactOpts, VerifyKind, VerifyReq } from './verify-fact-source.js';

// REVERIFY-GATE (versioned-store chapter, step 3): re-prove every `seal:'proven'` fact's OWN witness against
// the live index — `re-proven` / `broken` / `unverifiable`, never folded together. The pure fold; `atlas
// verify-store` (CLI) drives it over `ComposedRuntime.reverify`.
export { reverifyFact, reverifyStore, MINED_TIER } from './reverify-store.js';
export type { ReverifyOutcome, ReverifyRow, ReverifyReport, NodeFactPair } from './reverify-store.js';

// Sound-negation escape analysis (#99): a target that never escapes into shared state is
// groundable as a negative from the static index alone. Engine is language-blind; only the
// classifier + grammar are per-language.
export { tsEscapeClassifier } from './escape/classifier.js';
export type { EscapeClassifier } from './escape/classifier.js';

// The PROVENANCE tripwire's READ-side refusal (`read-provenance.ts`) — the half the write doors already had.
// Exported because the CLI entrypoint renders it (`cli/src/cli.ts`) and because a test must be able to
// assert on the DISCRIMINANT (`UntrustedStoreError.reason`) rather than on a substring of refusal prose.
export {
  REJECTED_UNTRUSTED_STORE,
  UntrustedStoreError,
  isUntrustedStore,
  readProvenanceRefusal,
  refuseUntrustedRead,
} from './read-provenance.js';
export type { ReadProvenanceReason } from './read-provenance.js';

// #112 — THE IDENTITY SCHEMA a durable store was written under (`identity-schema.ts`). Exported for the same
// two reasons the provenance refusal above is: a composition root / entrypoint has to be able to RENDER the
// refusal (see the RESIDUAL note on `identitySchemaRefusal` — `compose.ts` and `wire.ts` do not call it yet),
// and a test has to be able to assert on the DISCRIMINANT (`IdentitySchemaError.reason`) and to stamp a
// hand-built rival sidecar with the schema a real rival would have written.
export {
  IDENTITY_SCHEMA,
  IdentitySchemaError,
  REJECTED_FOREIGN_IDENTITY_SCHEMA,
  classifyIdentity,
  identitySchemaRefusal,
  identitySchemaText,
  refuseForeignIdentityWrite,
} from './identity-schema.js';
export type { IdentityBearing, IdentitySchemaReason, IdentityVerdict } from './identity-schema.js';
// The provenance SEAM itself — `mine` composes its own store and needs the same tripwire the doors ride.
export { gitSidecarTrust, isDurableStorePath } from './store-provenance.js';
export type { SidecarTrust } from './store-provenance.js';

// The versioned governance policy (WP-POLICY): declarative `.atlas/policy.json` + fail-closed loader. The
// WP name says "admin-locked"; the file is NOT locked by any live mechanism (see policy.ts) — the loader is.
export { loadPolicy, defaultPolicy, actorInScope } from './policy.js';
export type { AtlasPolicy, T0HeuristicPolicy, AuthzPolicy } from './policy.js';
