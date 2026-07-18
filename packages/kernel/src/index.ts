// @atlas/kernel — barrel
//
// The implementation surface WPs fill in at execution. For the skeleton, the only runtime export is
// the branded-value mint boundary (src/brand.ts) — the sanctioned cast sites for Hash/SubtreeHash/
// NodeKey. Everything else lives frozen in ref/*.ts until a WP implements it.

export { asHash, asSubtreeHash, asNodeKey } from './brand.js';
