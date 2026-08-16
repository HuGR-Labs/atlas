#!/usr/bin/env node
// harness/probes/comment-extractor.mjs — the FLOOR pool member for A4 recall.
//
// A4 asks: of the durable true facts a perfect miner SHOULD surface for a fixed corpus, what fraction did
// Atlas surface? `docs/design/95a-recall-a4-methodology.md` §3 needs the pool built from ≥2 miners besides
// Atlas. This is the cheap floor: every comment / docstring in a file, read as a candidate fact, with NO
// model call and NO grounding door at all. Comments are exactly what a human reader already has for free —
// a system that cannot beat "read the comments" has not earned credit for the union it is compared against.
//
// EXTRACTION IS BEST-EFFORT TEXT SCANNING, NOT A TOKENIZER. It tracks `//` runs and `/* … */` / `/** … */`
// blocks by literal substring search. It does not understand string literals that contain `/*` or `//`, and
// it will misparse pathological input. That is an accepted, stated limitation for a harness instrument whose
// corpus is a controlled, frozen file set (§4 of the design doc) — it is not shipped product code.
//
// Harness invariant (harness/README.md): no `@atlas/*` import.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * A cheap, DOCUMENTED-HEURISTIC classifier into the coarse fact-shape vocabulary the A4 stratification
 * needs (`docs/design/95a-recall-a4-methodology.md` §5). It is NOT the product's closed `PredicateSlot`
 * vocabulary (`packages/knowledge/src/types.ts`) — only Atlas's own mined facts carry that typed slot, read
 * straight off the store row in `a4-pool.mjs`. Non-Atlas miners (this file, `baseline-lister.mjs`) have no
 * typed slot at all, so this function gives every pool member a COMPARABLE, if approximate, shape axis.
 * @param {string} text
 * @returns {'negation'|'relation'|'predicate'|'advisory'}
 */
export function classifyShape(text) {
  const t = String(text).toLowerCase();
  if (/\b(never|not|no longer|cannot|can't|doesn't|does not|won't|isn't|isn t)\b/.test(t)) return 'negation';
  if (/\b(when|if|unless|before|after|until|because|depends on|requires)\b/.test(t)) return 'relation';
  if (/\b(must|always|invariant|guarantee|guarantees|throws|returns|ensures)\b/.test(t)) return 'predicate';
  return 'advisory';
}

/** Drop a run whose joined text is too short to be a durable fact, or is a pure separator/marker line. */
function isNoise(joined) {
  if (joined.length < 8) return true;
  if (/^[-=*#_~]+$/.test(joined.replace(/\s+/g, ''))) return true;
  if (/^eslint-disable|^prettier-ignore|^@ts-|^c8 ignore/i.test(joined)) return true;
  return false;
}

/**
 * Extract candidate facts from one file's source text: every contiguous `//` run and every `/* … *\/` /
 * `/** … *\/` block becomes one candidate, anchored at its line span.
 * @param {string} filePath
 * @param {string} text
 * @returns {Array<{id:string, anchor:string, text:string, shape:string, source:'comment-extractor'}>}
 */
export function extractComments(filePath, text) {
  const lines = String(text).split(/\r?\n/);
  const candidates = [];
  let n = 0;
  let block = null; // {startLine, textLines}
  let lineRun = null; // {startLine, textLines}

  const push = (start, end, textLines) => {
    const joined = textLines
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .join(' ')
      .trim();
    if (isNoise(joined)) return;
    n += 1;
    candidates.push({
      id: `COMMENT-${n}`,
      anchor: end > start ? `${filePath}:${start}-${end}` : `${filePath}:${start}`,
      text: joined,
      shape: classifyShape(joined),
      source: 'comment-extractor',
    });
  };

  const flushLineRun = (endLine) => {
    if (lineRun) {
      push(lineRun.startLine, endLine, lineRun.textLines);
      lineRun = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;

    if (block) {
      const closeIdx = raw.indexOf('*/');
      const content = (closeIdx >= 0 ? raw.slice(0, closeIdx) : raw).replace(/^\s*\*\s?/, '');
      block.textLines.push(content);
      if (closeIdx >= 0) {
        push(block.startLine, lineNo, block.textLines);
        block = null;
      }
      continue;
    }

    const blockOpenIdx = raw.indexOf('/*');
    const lineMatch = raw.match(/^\s*\/\/\s?(.*)$/);

    if (blockOpenIdx !== -1) {
      flushLineRun(lineNo - 1);
      const closeIdx = raw.indexOf('*/', blockOpenIdx + 2);
      const firstContent = (closeIdx >= 0 ? raw.slice(blockOpenIdx + 2, closeIdx) : raw.slice(blockOpenIdx + 2)).replace(
        /^\*\s?/,
        '',
      );
      if (closeIdx >= 0) {
        push(lineNo, lineNo, [firstContent]);
      } else {
        block = { startLine: lineNo, textLines: [firstContent] };
      }
      continue;
    }

    if (lineMatch) {
      if (!lineRun) lineRun = { startLine: lineNo, textLines: [] };
      lineRun.textLines.push(lineMatch[1]);
    } else {
      flushLineRun(lineNo - 1);
    }
  }
  flushLineRun(lines.length);
  if (block) push(block.startLine, lines.length, block.textLines); // unterminated block — best effort, not thrown

  return candidates;
}

function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    process.stderr.write('usage: comment-extractor.mjs <file> [<file> ...]\n');
    process.exit(2);
  }
  const all = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch (e) {
      process.stderr.write(`comment-extractor: cannot read ${f}: ${String(e?.message ?? e)}\n`);
      process.exit(1);
    }
    all.push(...extractComments(f, text));
  }
  process.stdout.write(`${JSON.stringify(all, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
