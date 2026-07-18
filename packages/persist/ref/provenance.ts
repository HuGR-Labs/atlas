// @atlas/persist — ref/provenance.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The trailer+note (de)serializer surface (PERSIST-3). Its anti-rot mock is "the trailer+note
// (de)serializer" that round-trips a `Dossier` through {trailer, note} so `readCommit` yields every
// required field and returns `null` (never throws) on absence — mirrors the Maestro `readDossierNote`
// contract (method-tags-pst:34-36).
//
// [SIG-TBD] The reference NAMES the behaviour (a "(de)serializer" + the `readCommit` round-trip) but
// freezes no concrete method signatures. The `serialize`/`deserialize` pair below is the faithful
// derivation of the named round-trip (Dossier ↔ {trailer, note}); the exact method names/shape are not
// frozen — flagged, not invented beyond the named round-trip.

import type { Dossier, Trailer, Note } from './types.js';

export interface ProvenanceApi {
  /** Split a dossier into its canonical trailer block + mutable note overlay. (method-tags-pst:36) */
  serialize(dossier: Dossier): { readonly trailer: Trailer; readonly note: Note };
  /** Reconstruct the dossier from the trailer (+ optional note); a total read — a missing note is
   *  tolerated, a fully-absent commit yields `null`, never a throw. (method-tags-pst:35-36) */
  deserialize(parts: { readonly trailer: Trailer; readonly note: Note | null }): Dossier | null;
}
