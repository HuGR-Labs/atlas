// @atlas/persist — src/provenance.ts  (trailer + git-note (de)serializer — PERSIST-3)
//
// Every WP's provenance is committed as a commit TRAILER block plus a mirroring `refs/notes/orchestra`
// NOTE, both carrying `{WP, Model, Gates, Verdict, Transcript-SHA}` so it moves with the commit across
// clone/fork/machine (PERSIST-3, atlas-persist:47-49). The oracle (ref/provenance.ts) PINS the frozen
// round-trip as `Dossier ↔ string`: `serialize` produces the committed text form; `deserialize` is a
// TOTAL read — a fully-absent / malformed commit yields `null`, never a throw (mirrors the Maestro
// `readDossierNote` contract). The trailer/note SPLIT is behavioural, not a frozen surface, so the
// portable committed form is the self-describing OKF-style JSON encoding of the whole `Dossier` (trailer
// + optional metering/knowledgeDelta) — no lock-in, replayable by any consumer. No raw hashing here:
// `TranscriptSha` is already the sealed `Hash` pointer carried on the `Trailer` (types.ts).

import type { Dossier } from '../ref/types.js';
import type { ProvenanceApi } from '../ref/provenance.js';

/**
 * Serialize a dossier to its committed text form (the trailer block + note overlay). The whole `Dossier`
 * is emitted verbatim, so every required provenance field (all five trailer fields, plus any metering /
 * knowledge-delta) survives the round-trip (SCN-PERSIST-3a-1). (method-tags-pst:36)
 */
export function serialize(dossier: Dossier): string {
  return JSON.stringify(dossier);
}

/**
 * Reconstruct the dossier from the serialized form. A TOTAL read (SCN-PERSIST-3b-1): an empty / whitespace
 * / malformed input — a commit with NO note — yields `null`, never a throw. A structurally-incomplete
 * payload (no `trailer`) is likewise an honest `null` rather than a partial dossier, so a caller never
 * observes a provenance record missing its canonical trailer. (method-tags-pst:35-36)
 */
export function deserialize(serialized: string): Dossier | null {
  if (typeof serialized !== 'string' || serialized.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const d = parsed as Partial<Dossier>;
  if (typeof d.trailer !== 'object' || d.trailer === null) return null;
  return d as Dossier;
}

// differential-vs-oracle (compile-time): the facet conforms to the frozen ProvenanceApi (ref/provenance.ts).
const _apiCheck: ProvenanceApi = { serialize, deserialize };
void _apiCheck;
