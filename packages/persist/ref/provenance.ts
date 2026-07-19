// @atlas/persist — ref/provenance.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// The trailer+note (de)serializer surface (PERSIST-3). Its anti-rot mock is "the trailer+note
// (de)serializer" that round-trips a `Dossier` through {trailer, note} so `readCommit` yields every
// required field and returns `null` (never throws) on absence — mirrors the Maestro `readDossierNote`
// contract (method-tags-pst:34-36).
//
// PINNED (oracle-pin reconciliation) — the frozen round-trip is `Dossier` ↔ `string` (the serialized
// git-storable form the `attachToCommit`/`readCommit` pair round-trips, method-tags-pst:34-36): serialize
// produces the committed text form, deserialize is a TOTAL read — a fully-absent commit yields `null`,
// never a throw. The (de)serializer's internal trailer/note split is behavioural, not a frozen surface.

import type { Dossier } from './types.js';

export interface ProvenanceApi {
  /** Serialize a dossier to its committed text form (the trailer block + note overlay). (method-tags-pst:36) */
  serialize(dossier: Dossier): string;
  /** Reconstruct the dossier from the serialized form; a total read — a fully-absent commit yields
   *  `null`, never a throw. (method-tags-pst:35-36) */
  deserialize(serialized: string): Dossier | null;
}
