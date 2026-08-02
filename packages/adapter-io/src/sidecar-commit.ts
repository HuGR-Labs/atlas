// @atlas/adapter-io — src/sidecar-commit.ts  (the ATOMIC COMMIT PROTOCOL over the durable sidecar)
//
// The write half of `sidecar.ts` — read it first: it carries the two MEASURED legs this protocol exists to
// close (an 8-writer race losing 1–5 nodes with every writer reporting `status: ok`; one emit onto a torn
// sidecar collapsing 402 nodes to 1), the three cheaper designs that were rejected with reasons, and the
// format. Split out of that file for the 400-line ceiling, along the seam that was already there: FORMAT +
// READ there, COMMIT here. Nothing else imports this module — the `DiskStore` methods are its only callers.
//
// The protocol, end to end:
//   1. READ the newest readable generation (`readSidecarSet`), remembering the highest NAME on disk.
//   2. RUN the caller's whole governed decision over that snapshot — pure, so it can be re-run.
//   3. WRITE the bytes to a pid-unique temp, `fsync`, close.
//   4. `link(2)` the temp to `<base>.<top+1>.json`. EEXIST ⇒ another writer got there first ⇒ go to 1.
//   5. VERIFY the name just won IS the head (see `publish` — winning a RECYCLED name is a silent loss, and
//      it was measured, not theorised).
//   6. Republish the compat mirror, prune, sync the directory.

import {
  closeSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { emptyStore } from '@atlas/knowledge';
import type { StoreProjection } from '@atlas/knowledge';
import { generations, genPath, mirrorPath, readSidecarSet } from './sidecar.js';
import type { CommitDecision, CommitResult, SidecarCtx, WireProjection } from './sidecar.js';

/** How many times a contended writer re-reads and re-decides before refusing. Bounded so a pathological
 *  writer cannot spin forever; the size is MEASURED, not guessed. At 16 an 8-process TIGHT COMMIT LOOP
 *  (five back-to-back commits per process, no work in between — far harsher than the one-commit-per-process
 *  shape the CLI produces) exhausted the budget on 1.25% of commits: a correct, visible refusal, but poor
 *  liveness. At 64 the same stress shows none. The real `atlas emit` race (8 concurrent CLI processes over
 *  a 1000-node store, 18 trials) never retries more than a handful of times. */
const MAX_ATTEMPTS = 64;

/** How many generations survive the prune. Correctness does NOT depend on this — the head verification in
 *  `publish` catches a recycled name however small it is — but every recycled name costs a wasted attempt,
 *  so the window is kept wide enough that recycling is rare and narrow enough that the directory holds a
 *  bounded multiple of the projection's size. Head + 3 predecessors. */
const RETAINED_GENERATIONS = 4;

/** Process-unique temp discriminator. `pid` separates processes; the counter separates concurrent commits
 *  INSIDE one process (an in-process MCP session runs both doors). Sharing a temp name between two writers
 *  reintroduces the torn write this whole protocol exists to remove. */
let tmpCounter = 0;

/** Serialize + publish ONE generation. Returns `false` iff another writer got there first (EEXIST) — every
 *  other failure (ENOSPC, EACCES, EROFS) PROPAGATES: a broken disk is not contention, and reporting it as
 *  "retry" would spin 16 times and then lie about why the write did not land. */
function publish(ctx: SidecarCtx, projection: StoreProjection, gen: number): boolean {
  const builtAt = ctx.headSha?.();
  const wire: WireProjection = {
    current: [...projection.current.entries()],
    cas: [...projection.cas],
    gen,
    ...(builtAt !== undefined ? { builtAt } : {}),
  };
  mkdirSync(ctx.dir, { recursive: true });
  const tmp = join(ctx.dir, `${ctx.base}.${process.pid}.${tmpCounter++}.tmp`);
  // fsync the BYTES before any name points at them. Without it the atomicity is only crash-consistent
  // against process death, not power loss: `link` could publish a name whose data blocks are still in the
  // page cache. THE PRICE IS MEASURED AND IT IS NOT SMALL — on this box (APFS, Intel) fsync(file) is
  // ~23 ms and fsync(dir) ~21 ms, against ~0.3 ms for the whole pre-fix in-place write. A governed emit
  // therefore costs ~+40 ms of durability it did not previously buy. That is a deliberate purchase, and it
  // is stated here rather than buried: it is a few percent of an `atlas emit` CLI invocation, and it is the
  // difference between "the last write survives a power cut" and "the store is whatever the page cache had".
  const bytes = JSON.stringify(wire);
  const fd = openSync(tmp, 'w');
  try {
    writeFileSync(fd, bytes, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  let committed = false;
  try {
    try {
      linkSync(tmp, genPath(ctx.dir, ctx.base, gen)); // THE compare-and-swap — EEXIST ⇒ someone else won
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; // ENOSPC/EACCES is not contention
      return false;
    }
    // ── HEAD VERIFICATION — the half of the CAS that a name-based CAS does NOT give you for free ────────
    // MEASURED DEFECT, found by an 8-process tight-loop stress and NOT by the CLI race: winning the name
    // `gen` proves only that the name was FREE, and the prune below RECYCLES names. A writer preempted for
    // two publications targets `top+1` after `top+1` has already been published AND pruned, links it
    // successfully, and publishes STALE content under a name that is now far below the head. Nobody ever
    // reads it (every reader takes the MAXIMUM generation), so the row is simply gone — and the writer
    // returned `settled:true`. That is the original silent lost update, reintroduced by the garbage
    // collector. Measured before this check: 2 of 6 stress rounds reported 40 commits with 39 durable.
    //
    // The check is one `readdir`: our publish is the head, or it is not a publish. If a rival has since
    // built ON us the check also fires (its generation is higher) and we redundantly retry — a wasted
    // round, never a wrong answer, and `upsert`/`linkSameAs` are idempotent for a decision re-applied to a
    // projection that already contains it. Erring toward the retry is the only direction that cannot lose.
    //
    // The stale file is deliberately NOT unlinked: it sits below the head, so no reader resolves it, and
    // the next publisher's prune reclaims it. Removing it here would delete the g-1 fallback out from under
    // a reader in the (real) case where the rival that fired this check had legitimately built on us.
    const headNow = generations(ctx.dir, ctx.base)[0];
    if (headNow !== undefined && headNow > gen) return false;
    committed = true;
    // THE MIRROR IS AN INDEPENDENT COPY, published by its own temp+rename — never a rename of the temp we
    // just linked. MEASURED BUG in the first version of this file: `link` + `rename(tmp, mirror)` leaves the
    // mirror and the head generation as two NAMES FOR ONE INODE, so anything that writes
    // `.atlas/projection.json` in place (a script, a restore, a test) silently truncated the head generation
    // too — the compatibility artifact became a back door onto the truth it was supposed to shield. A
    // separate inode costs one more small write (~0.3 ms, no fsync: the mirror is derived) and makes the
    // generation files unreachable by name from outside. Atomic all the same: readers see the old mirror or
    // the new one, never a prefix. Best-effort — losing the mirror must never fail a committed write.
    const mtmp = join(ctx.dir, `${ctx.base}.${process.pid}.${tmpCounter++}.mirror.tmp`);
    try {
      writeFileSync(mtmp, bytes, 'utf8');
      renameSync(mtmp, mirrorPath(ctx.dir, ctx.base));
    } catch {
      try {
        unlinkSync(mtmp);
      } catch {
        /* best-effort */
      }
    }
    return true;
  } finally {
    // The temp is ALWAYS ours to remove now that the mirror gets its own inode: on a win the generation
    // name holds the data, on a loss nothing does.
    try {
      unlinkSync(tmp);
    } catch {
      /* best-effort */
    }
    // The directory sync and the prune are the WINNER's housekeeping and run only when this call actually
    // published (`committed`). A loser has nothing to make durable and nothing to tidy — and paying a ~21 ms
    // fsync on every lost race is what turns contention into a stampede: each retry would slow the loser
    // down enough to lose again.
    if (committed) {
      // Durability of the NAME (not just the bytes) needs the directory synced. Best-effort: some platforms
      // refuse to open a directory for fsync, and a failure here costs durability on power loss, never
      // correctness — so it may not fail a committed write.
      try {
        const dfd = openSync(ctx.dir, 'r');
        try {
          fsyncSync(dfd);
        } finally {
          closeSync(dfd);
        }
      } catch {
        /* best-effort dir sync */
      }
      // LAZY PRUNE — keep the head and RETAINED_GENERATIONS-1 predecessors; drop the rest. Another writer
      // may have pruned the same name already, so every unlink is best-effort.
      for (const g of generations(ctx.dir, ctx.base)) {
        if (g > gen - RETAINED_GENERATIONS) continue;
        try {
          unlinkSync(genPath(ctx.dir, ctx.base, g));
        } catch {
          /* already gone / raced */
        }
      }
    }
  }
}

/**
 * THE write door of the mutable sidecar: read → decide → publish, retried WHOLE on a lost CAS.
 *
 * `decide` MUST be pure (no writes, no clock, no random) because it is re-run from scratch on every
 * contended attempt — and it must be the WHOLE governed decision, gates included, since re-publishing a
 * decision made against a stale snapshot is the confused-deputy bypass the header describes.
 */
export function commitSidecar<T>(ctx: SidecarCtx, decide: (p: StoreProjection) => CommitDecision<T>): CommitResult<T> {
  return commitLoop(ctx, decide, true);
}

/** The shared loop. `guardUnreadable` is what separates a DECISION from an unconditional publish: a decision
 *  read the snapshot, so a phantom-empty snapshot poisons it (leg 2) and the write must refuse; an
 *  unconditional persist never looked at the snapshot, so refusing would brick a caller (`mine` re-stages a
 *  whole pass) over a file its own decision does not depend on. */
function commitLoop<T>(
  ctx: SidecarCtx,
  decide: (p: StoreProjection) => CommitDecision<T>,
  guardUnreadable: boolean,
): CommitResult<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const read = readSidecarSet(ctx.dir, ctx.base, ctx.trusted);
    // PROVENANCE — UNCONDITIONAL, unlike `unreadable`. The `guardUnreadable` distinction exists because an
    // unconditional persist never looked at the snapshot, so refusing over a torn read would brick a caller
    // whose decision does not depend on it. That reasoning does not transfer here: writing over a COMMITTED
    // store would LAUNDER it — the attacker's rows become a file this process produced, indistinguishable
    // from door output afterwards, with the tracked-file evidence overwritten. Both write shapes refuse, and
    // `persistSidecar` turns this into a thrown, readable error rather than a silent no-op.
    if (read.untrusted) return { settled: false, refusal: 'untrusted' };
    if (guardUnreadable && read.unreadable) return { settled: false, refusal: 'unreadable' };
    const decision = decide(read.projection ?? emptyStore());
    if (decision.next === undefined) return { settled: true, out: decision.out }; // governed refusal: no write
    // CAS bytes FIRST, then the projection that references them. Idempotent by content address, so a retry
    // re-putting the same object writes nothing new; a failing `put` (disk-full/permission) throws BEFORE
    // any sidecar byte, so the sidecar can never reference a hash whose bytes are absent.
    for (const obj of decision.put ?? []) ctx.put(obj);
    if (publish(ctx, decision.next, read.top + 1)) return { settled: true, out: decision.out };
  }
  return { settled: false, refusal: 'contended' };
}

/** The UNCONDITIONAL publish behind `persistProjection`/`persistStaging` — the pre-existing seam, which has
 *  no decision to re-run and therefore stays last-writer-wins by DEFINITION. What it gains is atomicity: the
 *  bytes are published by `link`+`rename` from a synced temp, so no reader ever observes a prefix and leg 2
 *  cannot fire through it. Exhaustion THROWS: this signature returns void, and a silent no-op persist would
 *  be a new instance of the exact defect this file removes. */
export function persistSidecar(ctx: SidecarCtx, projection: StoreProjection): void {
  const result = commitLoop(ctx, () => ({ out: undefined, next: projection }), false);
  if (!result.settled) {
    if (result.refusal === 'untrusted') {
      // Named separately because the operator action is completely different from the other two, and a
      // generic "could not persist" would send them to look at the disk.
      throw new Error(
        `atlas: refusing to write the ${ctx.base} sidecar — \`.atlas/\` is TRACKED BY GIT in this repo, so the ` +
          `durable store arrived by COMMIT rather than through a governed door. A committed store carries rows ` +
          `no gate ever saw. Nothing was written and nothing was served. Remove it from version control ` +
          `(\`git rm -r --cached .atlas\`, keeping \`.atlas/policy.json\`) and re-derive the store locally.`,
      );
    }
    throw new Error(
      `atlas: could not persist the ${ctx.base} sidecar (${result.refusal}) after ${MAX_ATTEMPTS} attempts — ` +
        `nothing was written. This is reported rather than swallowed: a persist that silently does nothing ` +
        `is the lost update this protocol exists to make impossible.`,
    );
  }
}
