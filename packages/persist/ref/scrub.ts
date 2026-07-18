// @atlas/persist — ref/scrub.ts  (FROZEN INTERFACE — pure types, zero runtime logic)
//
// Redact-at-source — the PRIMARY credential control (PERSIST-10a). `scrub(buffer)` drops known
// credential shapes BEFORE the body is stored, so no raw secret ever reaches the immutable
// content-addressed object; it redacts secrets WITHOUT otherwise abridging the record
// (method-tags-pst:90-92). The ≥2-engine scanner (client + server-side pre-receive) is a BACKSTOP and
// is billy's FR-12 security domain — not modeled here. (atlas-persist:132-140)

export interface ScrubApi {
  /** Redact credential shapes from the transcript buffer at source; every non-secret byte preserved
   *  (no over-redaction). (method-tags-pst:91-92) */
  scrub(buffer: Uint8Array): Uint8Array;
}
