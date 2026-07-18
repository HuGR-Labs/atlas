// @atlas/contracts — hash.ts
//
// Layer-0 identity vocabulary: the CAS key, the swappable encoder seam, and the two hash-derived
// keys the rest of the Atlas anchors on. These three are ALL lower-hex strings at runtime but are
// SEMANTICALLY ORTHOGONAL (KNOW-15: contentHash = what, nodeKey = which, subtreeHash = current);
// conflating them is the classic way an Atlas rots. So they are BRANDED — the compiler forbids
// passing one leg where another is expected. Branding is purely a compile-time discipline: the
// values are minted (branded) at ~3 sites only — the @atlas/kernel encoder, the index subtreeHash
// compute, the knowledge nodeKey compute — via `asHash`/`asSubtreeHash`/`asNodeKey` constructors
// that live in @atlas/kernel (this package stays logic-free — types only).

/** Lower-hex BLAKE3 digest — the CAS key (the `contentHash` / dedup leg). Branded so it can't be
 *  confused with a nodeKey or subtreeHash. (atlas-kernel §Data model, line 15) */
export type Hash = string & { readonly __brand: 'Hash' };

/** The swappable digest seam (default BLAKE3). A signature only — the impl lives behind the
 *  @atlas/kernel encoder seam (KERNEL-2). (atlas-kernel line 16 / line 98) */
export interface Encoder {
  hash(bytes: Uint8Array): Hash;
}

/** THE DRIFT ORACLE — BLAKE3 of a structural unit's NORMALIZED AST subtree (not line numbers, not
 *  the file byte-hash). Its OWN brand — deliberately NOT `= Hash`, so the drift leg and the content
 *  leg stay orthogonal (KNOW-15). (atlas-grounding lines 32, 52-54; atlas-index line 62-64) */
export type SubtreeHash = string & { readonly __brand: 'SubtreeHash' };

/** The Atlas node identity: `hash(primaryAnchorId ‖ predicateSlot [‖ normalize(check)])`. Its own
 *  brand — one node per (anchor, slot), never interchangeable with a contentHash. (fspec-merge
 *  line 105-107; atlas-knowledge lines 123-124) */
export type NodeKey = string & { readonly __brand: 'NodeKey' };
