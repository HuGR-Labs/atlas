// @atlas/persist — ref/source.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Portable-source assembly (PERSIST-1). The reference NAMES the behaviour — the portable source is the
// tracked store + commit trailers (notes a mutable overlay); `clone(source)` reconstructs Atlas state;
// a placement check asserts no datum's only home is the PR attachment (method-tags-pst:20-22) — but it
// freezes NO concrete signature.
//
// [SIG-TBD] No concrete method signature is given in the reference for the portable-source assembly
// (store + trailers). Per the skeleton rule, the surface is flagged and NOT invented; a WP/later spec
// pins `SourceApi`'s methods. (Distinct from the PERSIST-9 export/import round-trip, which REUSES the
// KERNEL-6 `kernel/ref/portable.ts` (de)serializer — method-tags-pst:78 — and therefore has no new
// surface here.)

export interface SourceApi {
  // [SIG-TBD] — surface intentionally empty pending a frozen signature; do not invent.
}
