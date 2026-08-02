// @atlas/persist — src/scrub-shapes.ts  (WP-3.5-a.PERSIST · PERSIST-10a)
//
// WHAT A CREDENTIAL SHAPE IS, and how one is DERIVED from a family declaration.
//
// Every number the seam machinery in scrub.ts depends on (`minFull`, `maxPartial`, `maxContingent`) and every
// regex it matches with (`full`, `partial`, `cont`, `blockPrefix`) is COMPUTED here from one small declaration
// per family: the prefix that opens it, the characters its body is drawn from, and how many body characters
// it takes to clear the floor. Hand-writing those seven things per family is how a family gets declared with a
// bound that is one byte too small — which is not a missed match but a CHUNK-DEPENDENCE bug, i.e. a secret
// that leaks only for some chunkings. Declaring the family and deriving the rest makes that unrepresentable.
//
// ── WHY THE BODY LOOKAHEAD IS THE UNION OF ALL FAMILIES, NOT EACH FAMILY'S OWN ──────────────────────
// A body character class is greedy over characters that also spell a family prefix, so two credentials
// written back to back merge into ONE match and the second body ships in the clear. Blocking only a shape's
// OWN prefix fixes that within a family and leaves it wide open ACROSS families: with the own-prefix
// lookahead, `ghp_AAAAAA` immediately followed by `github_pat_…` matches through `…AAAAAAgithub` and emits
// `[REDACTED]_pat_<body>` — the fine-grained PAT's entropy-bearing body, in the clear, in an immutable
// content-addressed object. The lookahead below is therefore the union of EVERY declared family prefix.
//
// The union is also what makes the multi-shape composition sound at all. `scrub` applies one pass per shape;
// a single leftmost walk over all families applies them together. Those two agree only if matches can never
// overlap — and a match can only overlap another when one family's prefix starts INSIDE another family's
// body, which is exactly what the union lookahead forbids. Own-prefix lookaheads make the shipped output
// depend on the order shapes happen to be declared in.

/** The characters every credential body admits, as a regex class body. Families may add ONE more (below). */
const ALNUM = 'A-Za-z0-9';

/**
 * One credential FAMILY — the whole declaration. Everything else on `CredentialShape` is derived.
 *
 * `prefix` is one entry per character POSITION, and each entry is the SET of characters that position
 * admits (`'g'` = literally g; `'pousr'` = any one of those). It is declared as sets rather than as a regex
 * because the derivation has to ENUMERATE the prefix's strict prefixes (for the seam's ambiguity analysis),
 * and you cannot enumerate the strict prefixes of an opaque regex source.
 */
export interface CredentialFamily {
  readonly name: string;
  /** The opening prefix, one character-SET per position. */
  readonly prefix: readonly string[];
  /** Characters this family's body admits BEYOND `[A-Za-z0-9]` — at most one, and never a body character
   *  of a different family's separator by accident: see the per-family notes. */
  readonly bodyExtra: string;
  /** The minimum number of BODY characters after the prefix. */
  readonly floor: number;
}

/**
 * The declared families. TWO — not "credentials" in general. Anything not listed here is NOT redacted, and
 * the docs say so in those words. The four shapes deliberately left out are recorded at the bottom of this
 * file, with the measurement that disqualified each.
 */
export const FAMILIES: readonly CredentialFamily[] = [
  {
    // GitHub token: ghp_ / gho_ / ghu_ / ghs_ / ghr_ + >= 6 token characters. Single-segment; `_` is the
    // prefix separator and is NOT a body character, so `ghp_ABCDEF_prod` keeps `_prod`.
    name: 'github-token',
    prefix: ['g', 'h', 'pousr', '_'],
    bodyExtra: '',
    floor: 6,
  },
  {
    // Slack token: xoxb- / xoxa- / xoxp- / xoxr- / xoxs- + >= 6 body characters.
    //
    // OVER-REDACTION, DECLARED: a real Slack token is MULTI-SEGMENT (`xoxb-<id>-<id>-<secret>`) and `-` is
    // both its segment separator and, necessarily, a body character. Excluding `-` from the body would match
    // only the first segment and ship the trailing entropy-bearing segment in the clear — a leak, which for
    // a credential control is strictly worse than the alternative. So `-` IS a body character, and the cost
    // is that hyphen-joined NON-secret text immediately following a Slack token is absorbed into the
    // redaction: `xoxb-A1B2C3-not-part-of-token` redacts whole. That is the SAME class of over-redaction the
    // GitHub family already has on trailing alphanumerics (`ghp_XXXXXXfoo` eats `foo`, `{6,}` being
    // unbounded); it is bounded by the first non-body byte (space, quote, newline, `=`, `.`), and it can
    // only ever trigger AFTER a literal `xox[baprs]-`. Accepted, and stated in the requirement prose.
    name: 'slack-token',
    prefix: ['x', 'o', 'x', 'baprs', '-'],
    bodyExtra: '-',
    floor: 6,
  },
];

/**
 * A credential SHAPE, described completely enough to be recognised ACROSS a chunk boundary. `full` alone is
 * not enough: to decide the tail of a chunk you must also know what a not-yet-complete prefix looks like
 * (`partial`), which bytes a complete match would keep absorbing (`cont`), and which trailing bytes are
 * still AMBIGUOUS because more bytes would turn them into the family prefix of the NEXT credential
 * (`blockPrefix`). Declaring a shape without those is what let a split — and then an adjacent — secret
 * through, so they are part of the shape, not of the algorithm.
 */
export interface CredentialShape {
  /** The family this shape was derived from (diagnostics; never matched against). */
  readonly name: string;
  /** g-flagged; matches a COMPLETE credential. The single source of truth for what `scrub` redacts. */
  readonly full: RegExp;
  /** Anchored; matches a STRICT prefix — not a credential yet, but more bytes could make it one. */
  readonly partial: RegExp;
  /** Anchored; the run of bytes a COMPLETE match keeps absorbing greedily (its body character class).
   *  ALWAYS NON-EMPTY-CAPABLE for the families above, because every one of them is UNBOUNDED (`{n,}`). A
   *  BOUNDED family (fixed-length, e.g. AWS `AKIA[0-9A-Z]{16}`) must have an EMPTY `cont` — see the note at
   *  the bottom of this file — and this descriptor cannot express that, which is why none is declared. */
  readonly cont: RegExp;
  /** End-anchored; the longest trailing run that is a strict prefix of ANY declared family prefix and is
   *  spelled entirely in THIS shape's body characters. Those bytes cannot be classified until more bytes
   *  arrive: they are either body, or the head of the credential that follows. */
  readonly blockPrefix: RegExp;
  /** The shortest string `full` can match — the floor a candidate must clear WITHOUT its ambiguous tail. */
  readonly minFull: number;
  /** The longest string `partial` can match. */
  readonly maxPartial: number;
  /** The longest COMPLETE match whose completeness still depends on its ambiguous tail. */
  readonly maxContingent: number;
}

// ── derivation ──────────────────────────────────────────────────────────────────────────────────────

function isAlnumChar(c: string): boolean {
  const n = c.charCodeAt(0);
  return (n >= 48 && n <= 57) || (n >= 65 && n <= 90) || (n >= 97 && n <= 122);
}

/** Is `c` a BODY character of `f`? The single definition; the regex class below is built from it. */
export function inBody(f: CredentialFamily, c: string): boolean {
  return isAlnumChar(c) || (c !== '' && f.bodyExtra.includes(c));
}

/** One prefix POSITION as regex source. Every declared character is `[A-Za-z0-9_-]` (asserted by test), all
 *  of which are literal outside a character class and safe last-position inside one — no escaping needed. */
function atom(set: string): string {
  return set.length === 1 ? set : `[${set}]`;
}

const prefixSrc = (f: CredentialFamily): string => f.prefix.map(atom).join('');
const bodyClass = (f: CredentialFamily): string => `[${ALNUM}${f.bodyExtra}]`;

/** The union of every declared family prefix — what a body character may NOT open. */
export const ANY_FAMILY_PREFIX = `(?:${FAMILIES.map(prefixSrc).join('|')})`;

/** A body character of `f` that does not open ANY family's prefix. The one lookahead that stops a credential
 *  from swallowing the credential written immediately after it, whatever family that one belongs to. */
const bodyAtom = (f: CredentialFamily): string => `(?:(?!${ANY_FAMILY_PREFIX})${bodyClass(f)})`;

/** Every STRICT prefix of `g`'s opening prefix that is spelled entirely in `shape`'s body characters — the
 *  runs that can sit ambiguously at the end of a `shape` body. Stops at the first position `shape` could not
 *  have produced as body (e.g. `github_pat`'s `_` is body for github-pat, but not for slack or github-token,
 *  which is why the same family contributes a 10-character ambiguity to one shape and 6 to another). */
function ambiguousAlts(shape: CredentialFamily): string[] {
  const alts: string[] = [];
  for (const g of FAMILIES) {
    for (let k = 1; k < g.prefix.length; k++) {
      const usable = [...(g.prefix[k - 1] as string)].filter((c) => inBody(shape, c)).join('');
      if (usable === '') break; // cannot extend past a position this shape's body cannot spell
      alts.push(
        g.prefix
          .slice(0, k - 1)
          .map((s) => atom([...s].filter((c) => inBody(shape, c)).join('')))
          .join('') + atom(usable),
      );
    }
  }
  return alts.sort((a, b) => b.length - a.length);
}

/** How many CHARACTERS the longest such ambiguous run is (each alternative is one atom per character). */
function maxAmbiguous(shape: CredentialFamily): number {
  let n = 0;
  for (const g of FAMILIES) {
    for (let k = 1; k < g.prefix.length; k++) {
      if ([...(g.prefix[k - 1] as string)].every((c) => !inBody(shape, c))) break;
      n = Math.max(n, k);
    }
  }
  return n;
}

/** Derive the full shape from a family declaration. Every bound is arithmetic on the declaration:
 *
 *    minFull       = |prefix| + floor                       the shortest complete match
 *    maxPartial    = |prefix| + floor - 1                   one body character short of the floor
 *    maxContingent = |prefix| + floor - 1 + maxAmbiguous     a COMPLETE match that un-makes itself if its
 *                                                           ambiguous tail turns out to open the next
 *                                                           credential (length - tail < minFull)
 */
export function shapeOf(f: CredentialFamily): CredentialShape {
  const p = prefixSrc(f);
  const body = bodyAtom(f);
  const own: string[] = [];
  for (let k = 1; k < f.prefix.length; k++) own.push(f.prefix.slice(0, k).map(atom).join(''));
  const alts = ambiguousAlts(f);
  return {
    name: f.name,
    full: new RegExp(`${p}${body}{${f.floor},}`, 'g'),
    partial: new RegExp(`^(?:${own.join('|')}|${p}${bodyClass(f)}{0,${f.floor - 1}})$`),
    cont: new RegExp(`^${body}*`),
    blockPrefix: new RegExp(`(?:${alts.join('|')})$`),
    minFull: f.prefix.length + f.floor,
    maxPartial: f.prefix.length + f.floor - 1,
    maxContingent: f.prefix.length + f.floor - 1 + maxAmbiguous(f),
  };
}

export const SHAPES: readonly CredentialShape[] = FAMILIES.map(shapeOf);

// ── DELIBERATELY NOT DECLARED (each was measured; each breaks something specific) ────────────────────
//
// A family belongs above only if it is PREFIXED, SINGLE-SEGMENT and UNBOUNDED, because that is the only
// thing this descriptor can express soundly. The four below are none of those, and adding one without first
// extending the descriptor is a REGRESSION, not a coverage win:
//
//  · AWS access key id `AKIA[0-9A-Z]{16}` — FIXED-LENGTH. `cont` is what a complete match keeps absorbing
//    from the NEXT chunk, and for a bounded shape that set is EMPTY: nothing follows a complete AKIA that
//    belongs to it. Declaring the natural non-empty `cont` (`^[0-9A-Z]*`) breaks chunk-independence outright
//    — `AKIAIOSFODNN7EXAMPLEX` scrubs to `[REDACTED]X` whole-buffer but to `[REDACTED]` when the final `X`
//    lands in a later chunk, because the seam absorbs it. `cont` is not optional in `CredentialShape` and
//    the interface nowhere says "empty for a bounded shape". TO ADD AWS: make `cont` optional, document
//    empty-for-bounded, and add `maxLen` so `full` stops absorbing — then measure on the chunked path.
//  · JWT `eyJ…` — MULTI-SEGMENT. `full` matches one base64url segment while `cont` absorbs the `.`, so the
//    two paths disagree and the whole-buffer path leaves the SIGNATURE in the clear. Needs a segment-aware
//    descriptor (a repeated <separator, class> pair), not a single body class.
//  · PEM `-----BEGIN … PRIVATE KEY-----` — needs "absorb until the `-----END …-----` terminator". `cont` is
//    a character-class run with no terminator field at all, and it would need a BOUND as well, or a missing
//    END line eats the rest of the transcript into one placeholder.
//  · AWS SECRET access key — 40 base64 characters with NO distinctive prefix. Shape alone cannot tell it
//    from any other base64 blob (over-redaction of ordinary content); it needs a CONTEXT field
//    (`aws_secret_access_key\s*=`), which inflates `maxPartial` to the context length and with it the seam
//    carry every stream pays for.
