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
