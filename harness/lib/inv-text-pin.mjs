// harness/lib/inv-text-pin.mjs — waiver-coverage classification + the text pin that backs it.
//
// ── THE HOLE THIS CLOSES (reproduced, not inherited) ─────────────────────────────────────────────────
// `req-clause-guard` protects an invariant TRANSITIVELY: it holds each citing REQ's `normative-clause`
// against the invariant's own block, so amending the invariant breaks the quotes. A row in
// `harness/req-clause-ledger.json` is a WAIVED quote — a divergence a human ruled pre-existing. The
// mechanism is legitimate and stays. What was never checked is what happens when it becomes TOTAL.
//
// MEASURED on this tree: `INV-TOOLS-1` — the constitutional write-door invariant — is cited by five REQs
// and all five are ledgered. No live quote remains to break. The whole normative text of that invariant was
// replaced with its own negation ("There is NO governance surface... writes MUST NOT flow through a
// governed write door... every refusal MUST be SILENT") and EVERY gate in `harness/gates/` exited 0. The
// instrument was not dead: widening the same splice to also swallow `INV-TOOLS-2` made `req-clause-guard`
// exit 1, naming `REQ-TOOLS-2a`/`2b`. So 100% waiver coverage of an invariant = ZERO protection for it.
//
// ── WHY A DIGEST OF THE TEXT, AND NOT "REQUIRE ONE LIVE QUOTE" ───────────────────────────────────────
// The obvious fix is to demand that some citing REQ keep an unwaived quote. It was TESTED and it is not
// protection, because a quote is a FRAGMENT. `INV-PERSIST-14` stands one waiver from this state: its sole
// live quote is `REQ-PERSIST-14-e`'s four words `"byte-identical across runs"`. That invariant's block was
// inverted end to end — "MUST partition" to "MUST NOT partition", "a **PURE READ** (0 mutation)" to "a
// WRITE (mutation REQUIRED)", "**not** a stored/materialized diff" to "MUST be a stored/materialized
// diff" — with those four words left in place, and `req-clause-guard` still scored `REQ-PERSIST-14-e` as
// OK and exited 0. A rule satisfied by four surviving words would have certified that inversion as
// protected. So the pin is over the invariant's OWN text: nothing short of it covers what the citing REQs
// no longer do.
//
// ── WHAT IS PINNED, EXACTLY ──────────────────────────────────────────────────────────────────────────
//   - EVERY carrier of the anchor, in document order, not just the first. `req-clause-guard` takes its
//     verdict at the first carrier (the `## Invariants` bullet), but both invariants in this state carry a
//     second statement in `## Acceptance`, and a pin over the bullet alone would leave the restatement
//     freely rewritable while this file claimed the invariant was pinned.
//   - Normalised the way the guard already normalises: whitespace runs collapsed (the reference docs
//     hard-wrap at ~110 columns, so re-wrapping a paragraph is not a change of text), and HTML comments
//     already stripped by the caller (the house records an amendment as an `<!-- AMENDED ... -->`
//     tombstone INSIDE the block; a pin that broke on adding one would push authors to skip the tombstone).
//   - The anchor key is hashed WITH the text, so a pin cannot be moved between invariants by copy-paste.
// NOT case-folded, NOT markdown-stripped, NOT punctuation-folded: `MUST` is not `must`, and the amendment
// that shipped `req-clause-guard` turned "pack" into "**governing** pack", which a `**`-blind pin cannot
// see.
//
// ── THE COST, STATED ─────────────────────────────────────────────────────────────────────────────────
// A legitimate amendment to a pinned invariant breaks the pin and must be re-pinned in the same commit.
// That is the intent — the pinned set is precisely the set whose ratified text nothing else is watching —
// but it is a real tax, and it is why the pinned set is DERIVED (the invariants with zero live quotes)
// rather than a list somebody grows. An invariant that regains a live quote makes its pin STALE, and a
// stale pin FAILS this gate, exactly as a stale ledger row does.

import { createHash } from 'node:crypto';

/** The guard's own normalisation: runs of whitespace collapse to one space. */
export const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * The pin over one invariant: its anchor key plus every carrier's normalised text, in document order.
 * @param {string} anchorKey e.g. `docs/reference/atlas-tools.md#tools-1`
 * @param {{ line: number, text: string }[]} carriers as `req-clause-guard`'s `invCarriers` returns them
 */
export function pinDigest(anchorKey, carriers) {
  const h = createHash('sha256').update(anchorKey);
  for (const c of carriers) h.update(' ').update(norm(c.text));
  return h.digest('hex').slice(0, 32);
}

/**
 * Split the cited invariants by how much LIVE quote coverage each still has.
 *
 * @param {Map<string, { live: string[], waived: string[], carriers: object[] }>} coverage
 *        anchorKey -> the REQ ids whose quote resolves into it, those whose quote diverges, its carriers.
 * @returns unprotected (zero live quotes, so nothing mechanical is left) and nearMiss (exactly one live
 *          quote AND at least one waiver: one more waiver from unprotected, REPORTED so the class is
 *          visible before it bites, never gated on).
 */
export function classifyCoverage(coverage) {
  const unprotected = [];
  const nearMiss = [];
  for (const [anchor, v] of [...coverage].sort()) {
    const row = { anchor, live: v.live, waived: v.waived, carriers: v.carriers };
    if (v.live.length === 0) unprotected.push(row);
    else if (v.live.length === 1 && v.waived.length > 0) nearMiss.push(row);
  }
  return { unprotected, nearMiss };
}

/**
 * The refusals. An invariant whose every citing REQ is waived MUST carry a pin, and that pin MUST still
 * match the tree; a pin for an invariant that has recovered a live quote is STALE and fails, so the pinned
 * set can never rot into a standing exemption list.
 */
export function pinProblems(unprotected, pins, pinFile) {
  const problems = [];
  const expected = new Set();
  for (const inv of unprotected) {
    expected.add(inv.anchor);
    const at = `carrier(s) at line ${inv.carriers.map((c) => c.line).join(', ')}`;
    const digest = pinDigest(inv.anchor, inv.carriers);
    const pin = pins[inv.anchor];
    if (pin === undefined) {
      problems.push(
        `UNPROTECTED INVARIANT '${inv.anchor}' (${at}): all ${inv.waived.length} REQ(s) citing it carry a ` +
          `normative-clause that no longer resolves into it (${inv.waived.join(', ')} — waived in the ledger, ` +
          `or reported above as an open divergence), so no live quote covers it and NOTHING ` +
          `mechanically holds its text. Its whole normative text could be replaced by its own negation and ` +
          `every gate would still pass. Restore protection by un-waiving one of those REQs so that it lifts ` +
          `the invariant verbatim again; or, if every waiver is genuinely correct, PIN the ratified text: ` +
          `add "${inv.anchor}": { "digest": "${digest}", "why": "<who ratified this text, and when>" } to ` +
          `${pinFile}. That digest is computed from the tree as it stands right now.`,
      );
    } else if (pin.digest !== digest) {
      problems.push(
        `PINNED INVARIANT '${inv.anchor}' (${at}) HAS CHANGED: no live REQ quote covers this invariant, so ` +
          `its pin is the only thing holding its ratified text, and that text no longer matches. Pinned ` +
          `${JSON.stringify(pin.digest)}, tree is ${JSON.stringify(digest)}. If the edit is ratified, ` +
          `update the digest in ${pinFile} IN THE SAME COMMIT and record who ratified it; otherwise revert ` +
          `the edit. Pinned because: ${JSON.stringify(pin.why ?? '(no reason recorded)')}.`,
      );
    }
  }
  for (const anchor of Object.keys(pins)) {
    if (!expected.has(anchor)) {
      problems.push(
        `STALE PIN '${anchor}' in ${pinFile}: this invariant is no longer in the fully-waived set, so the ` +
          `pin would silently outlive the condition that justified it. Either a live REQ quote covers the ` +
          `invariant again (good — delete the entry, the pinned set only shrinks), or NO evaluable REQ ` +
          `cites it at all any more, in which case deleting the last citing REQ has quietly moved this ` +
          `invariant outside everything this gate can see: say that deliberately rather than by deletion.`,
      );
    }
  }
  return problems;
}
