// harness/probes/mine-report.mjs — parse the ONE site ledger a genesis run produces: its own stdout.
//
// Split from `genesis-output-probe.mjs` along the seam the product itself draws (`cli/src/mine-render.ts`
// is a separate file for the same reason): reading a durable store and reading a rendered report are two
// different acts, and only one of them is about bytes that survive the process.
//
// ── WHY THIS FILE HAS TO EXIST AT ALL ────────────────────────────────────────────────────────────────────
// A genesis run leaves NO durable record of which sites it visited. `GenesisReport`
// (`packages/genesis/src/types.ts`) carries `seeded` / `ratified` / `open` / `llmCalls` / `budgetSpent` and
// NO abstention field; the run controller drops the per-site `WhyNot`s anyway (`run-controller.ts`: `visit`
// returns `.facts` only). So in every artifact the product writes to disk, a site that ABSTAINED and a site
// that was silently DROPPED are indistinguishable. What the run PRINTS is the only ledger there is, and that
// is why the probe asks for it rather than inventing a totality it cannot support.
//
// The three lines below are the ones `docs/reference/commands/mine.md` pins verbatim. Parsing rendered
// output is a weak contract and is treated as one: an unparseable report is reported as such, never
// silently read as zeroes.

/** The `atlas mine` header line — the report's own count of what it seeded. */
const SEEDED = /^genesis: seeded (\d+) candidate fact\(s\); ratified (\d+)$/m;
/** The GEN-13 cost line. `budgetSpent` counts SITES, one unit per completed site (`run-controller.ts`). */
const COST = /^cost: llmCalls (\d+) · budgetSpent (\d+)$/m;
/** The `mineWhyEmpty` branch where the structural pass yielded no site at all. */
const ZERO_SITES = /^mine: (\d+) candidate facts — 0 sites visited\b/m;
/** Every other branch: `mine: <k> candidate facts — <m> site(s) visited …`. */
const VISITED = /^mine: (\d+) candidate facts — (\d+) site\(s\) visited\b/m;
/** The ONE branch whose prose accounts for the abstentions — the only place the residual is attributable. */
const ALL_ABSTAINED = /site\(s\) visited and every one abstained/;

/**
 * Parse a captured `atlas mine` stdout.
 *
 * Returns `undefined` when the three pinned lines are not all present — a report this cannot read is not a
 * run it can vouch for, and answering `{seeded: 0, sites: 0}` for an unparseable file would be the same
 * "corrupt read as empty" amplification `promote.md` refuses one door over.
 */
export function parseMineReport(text) {
  const seededLine = SEEDED.exec(text);
  const cost = COST.exec(text);
  const zero = ZERO_SITES.exec(text);
  const visited = VISITED.exec(text);
  if (seededLine === null || cost === null || (zero === null && visited === null)) return undefined;
  return {
    seeded: Number(seededLine[1]),
    ratified: Number(seededLine[2]),
    llmCalls: Number(cost[1]),
    budgetSpent: Number(cost[2]),
    sites: zero !== null ? 0 : Number(visited[2]),
    candidates: Number(zero !== null ? zero[1] : visited[1]),
    /** Did the run's own prose account for every visited site as an abstention? */
    allAbstained: ALL_ABSTAINED.test(text),
  };
}
