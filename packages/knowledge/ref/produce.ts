// @atlas/knowledge — ref/produce.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Born from work — the moment-gated producer + seal probe (KNOW-13, spec A-10/§8). Facts are produced
// ONLY at the three moments (init skeleton → enrich-by-blast-radius → wave-close write), NEVER a
// repo-wide sweep. A sealing wave MUST have fed the Atlas (`absorb`) or emitted a grounded why-not; a
// bare seal records a violation. Transcribed from atlas-knowledge:63, 208-209 and method-tags-knw:
// 102-107.
//
// [SIG-TBD — signatures partly frozen] method-tags-knw:106 describes "a reference producer that accepts
// a production event only if tagged one of the 3 moments; the seal probe asserts `absorb ∨ why-not`".
// The 3 moments ARE frozen (transcribed as `ProductionMoment`); the surrounding event/probe record
// shapes are NOT — `unknown` where unfrozen, flagged, NOT invented.

/**
 * The three — and ONLY three — production moments (KNOW-13, atlas-knowledge:63). Facts produced outside
 * these (a repo-wide sweep) MUST yield 0 facts (method-tags-knw:106). The list is closed.
 */
export type ProductionMoment = 'init-skeleton' | 'enrich-by-blast-radius' | 'wave-close-write';

export interface ProduceApi {
  /** Moment-gated producer (KNOW-13): a production event is ACCEPTED only if tagged one of the three
   *  `ProductionMoment`s; a repo-wide sweep produces 0 facts. Pure + total.
   *  [SIG-TBD] the production-event body and the accepted-facts return are not frozen → `unknown`. */
  produce(moment: ProductionMoment, event: unknown): unknown;

  /** Seal probe (KNOW-13): a sealing wave that neither fed the Atlas (`absorb`) nor emitted a grounded
   *  why-not records a VIOLATION. `violation:true` on a bare seal. Pure + total.
   *  [SIG-TBD] the wave/seal input is not frozen → `unknown`; `violation` is the reference-implied leg. */
  sealProbe(seal: unknown): { readonly violation: boolean };
}
