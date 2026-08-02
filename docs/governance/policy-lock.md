# Governance policy lock

`.atlas/policy.json` externalizes Atlas's governance tunables (near-dup τ, the T0-candidate keyword set,
and the KNOW-11 owner-scoped write map) as **data the engine reads**. Because these rules decide who may
write what — and how facts merge — the file is **admin-owned by intent** and its edits are *meant* to be
locked. This mirrors Atlas's own T0 rule: a governance change is a **human-ratified** act, not an automatic
one. **Neither lock mechanism below is in force today** — see the status note on each.

## The lock (two mechanisms, both required — neither active as of 2026-08-01)

1. **Ownership — CODEOWNERS.** The repo-root `CODEOWNERS` assigns `/.atlas/policy.json` to
   `@HuGR-Labs/atlas-admins`. **NOT IN FORCE:** that team does not exist. `gh api orgs/HuGR-Labs/teams`
   returns `[]` (as does the former `HumanGuardrail` org), and `gh api repos/HuGR-Labs/atlas/codeowners/errors`
   reports `Unknown owner` for the `/.atlas/policy.json` rule. (That endpoint reads the **default branch**,
   so it still quotes the pre-move `@HumanGuardrail/atlas-admins` string until the rename lands on `master`;
   neither team exists, so the verdict is identical.) GitHub cannot request review from a team that is not there, so the
   entry protects nothing. It starts binding only once the team exists, is visible, has write access — and
   only together with mechanism 2.
2. **Enforcement — branch protection.** CODEOWNERS is only advisory until branch protection makes the
   code-owner review *required to merge*. **NOT IN FORCE, and unavailable on the current plan:**
   `gh api repos/HuGR-Labs/atlas/branches/master/protection` and `gh api repos/HuGR-Labs/atlas/rulesets`
   both return `403 — "Upgrade to GitHub Pro or make this repository public to enable this feature."` The
   org is on the **free** plan and the repo is **private**, so no protection rule or ruleset can exist at all.

## Who may do what

- **Anyone may propose.** Open a PR editing `.atlas/policy.json`. The loader is fail-closed, so a bad
  proposal cannot degrade safety even if it lands: an absent or malformed policy resolves to the
  conservative `defaultPolicy()` (exact-match near-dup, empty T0 keywords, **empty scopes ⇒ no write
  authorized**; reads stay universal).
- **Only admins ratify — INTENDED, not enforced.** The design is that a merge requires a
  `@HuGR-Labs/atlas-admins` review, the same shape as Atlas T0 human-ratification. Today nothing
  mechanically requires it: with both mechanisms above inactive, any collaborator with write access can
  merge — or push straight to `master` — a policy change. The fail-closed loader above is the only control
  actually in force.

## The exact sequence that would make the lock real

Verified read-only on 2026-08-01 (`gh api`, no setting changed). Every step is a precondition for the next;
skipping any one leaves the lock inert in exactly the way it is inert today.

1. **Make the repo public** — tracked as task #92, already owner-authorized. `gh api orgs/HuGR-Labs` reports
   plan `free` and the repo is `private`, which is precisely why protection 403s. Public makes branch
   protection **and** rulesets available at no cost, so this resolves without money. (The alternative is
   paying for a plan; nothing else about the sequence changes.) *Precondition: the history must be fit to
   publish — this is a private repo, and publishing is irreversible in practice.*
2. **Create the `atlas-admins` team** in `HuGR-Labs` — **visible** (not secret: GitHub will not resolve a
   secret team in CODEOWNERS) and holding **write** access on the repo. `gh api orgs/HuGR-Labs/teams`
   currently returns `[]`. Add the ratifying humans as members. **Note what this moves, rather than
   removes: the root of trust becomes "who may change team membership", i.e. the org owners.** The file
   never was the root.
3. **Widen CODEOWNERS beyond `policy.json` — this is a gap in the plan as previously written.** Owning only
   `/.atlas/policy.json` is defeated by two ordinary PRs: the first edits `CODEOWNERS` itself (no owner
   ⇒ no review required), the second edits the policy freely. The same holds for any workflow that can
   commit. So the file must own **itself** and the CI that enforces it:

   ```
   /.atlas/policy.json   @HuGR-Labs/atlas-admins
   /CODEOWNERS           @HuGR-Labs/atlas-admins
   /.github/workflows/   @HuGR-Labs/atlas-admins
   ```

4. **Protect `master`** (branch protection rule or the ruleset equivalent), with all of:
   - *Require a pull request before merging* — no direct pushes.
   - *Require review from Code Owners* — this is what makes step 3 binding.
   - *Require approvals* ≥ 1, and *dismiss stale approvals on new commits* — otherwise an approved PR can be
     force-updated with different content after review.
   - *Block force pushes* and *block deletions* on `master`.
   - **Do not allow bypassing the above settings — apply to administrators too.** Without this the whole
     sequence is decorative: any repo admin pushes straight to `master`.
5. **Verify mechanically, not by reading the settings page.** The lock is real only when both of these hold:
   - `gh api repos/HuGR-Labs/atlas/codeowners/errors` returns **no** errors (today: `Unknown owner on line 7`).
   - `gh api repos/HuGR-Labs/atlas/branches/master/protection` returns **200** (today: `403`) with
     `required_pull_request_reviews.require_code_owner_reviews == true` **and** `enforce_admins.enabled == true`.

**What still would not be true afterwards.** The lock governs how the file CHANGES IN THIS REPO. It does not
authenticate the actor the policy names (`docs/reference/atlas-architecture.md` §3.3 / ARCH-12 — `ATLAS_ACTOR`
is self-asserted), and it does not bind a CLONE: anyone who copies the repo edits their own `policy.json`
freely, because the policy is read from the working tree. The lock is a control over the shared branch, and
only that.

## The durable store is a separate root, and it is now checked

`.atlas/policy.json` is the only file under `.atlas/` that belongs in git. The rest — `projection.json`,
`staging.json`, `cas/**` — is the DURABLE STORE: knowledge produced by the governed doors. Committing it
publishes rows with any `nodeKey`, `scope`, `tier` and `contentHash` past every gate, because no gate runs
during a `git add`. Reproduced end to end in `packages/adapter-io/test/store-provenance.test.ts`: with
`authz.scopes = {}` (every write door denying every write), a committed projection was served as a ratified
`T0` pack invariant.

Two mechanisms, and they are not alternatives:

- **`.gitignore`** (`.atlas/*` + `!.atlas/policy.json`) stops the ACCIDENT, which is the common case. It is
  not a control: `git add -f` overrides it in one flag.
- **The provenance tripwire** (`packages/adapter-io/src/store-provenance.ts`) is the control. At load, it
  asks whether the durable store is TRACKED BY GIT — a door writes it to the working tree and never stages
  it, so tracking means it arrived by commit. A tracked store reads as EMPTY (serves nothing) and REFUSES
  every write (so it is not silently overwritten and laundered into door output).

**Note that content-verification would NOT have closed this**, which is worth recording because it is the
intuitive fix. The store already re-hashes every CAS object on read, and the emit door already requires a
row to corroborate its own bytes. Both pass for a committed store, *by construction*: the attacker who writes
the file computes the hashes with the product's own `id()`. Content-addressing authenticates **integrity**,
never **provenance**. Only a keyed construction (a MAC/signature under a key the committer lacks) would, and
this product has no key material and nowhere to put it that a committer could not also read.

## Admin setup (not yet possible — see the two preconditions)

Two things must happen before any of this can be turned on: **create the `atlas-admins` team** (visible,
with write access on the repo), and **make branch protection available** — upgrade the org off the free
plan or make the repo public, since the API currently rejects both protection and rulesets with a `403`.
Then, on the default branch (Settings → Branches → branch protection rule, or the rulesets equivalent):

- **Require a pull request before merging** — no direct pushes to the protected branch.
- **Require review from Code Owners** — this is what makes the CODEOWNERS entry binding for
  `.atlas/policy.json`.
- **Require status checks to pass** — include the policy/adapter-io gate so a malformed policy is caught in
  CI, not at runtime.
- **Do not allow bypassing the above settings** (apply to admins too) — otherwise the lock is optional.

Until then, CODEOWNERS is worse than advisory here — it names an owner GitHub does not recognize, so it is
inert. The runtime remains safe regardless (fail-closed default), but the *lock* is not in force, and has
never been in force: the entry has named this same non-existent team since it was introduced in `8fdc020`.
