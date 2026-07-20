# Governance policy lock

`.atlas/policy.json` externalizes Atlas's governance tunables (near-dup τ, the T0-candidate keyword set,
and the KNOW-11 owner-scoped write map) as **data the engine reads**. Because these rules decide who may
write what — and how facts merge — the file is **admin-owned** and its edits are locked. This mirrors
Atlas's own T0 rule: a governance change is a **human-ratified** act, not an automatic one.

## The lock (two mechanisms, both required)

1. **Ownership — CODEOWNERS.** The repo-root `CODEOWNERS` assigns `/.atlas/policy.json` to
   `@HumanGuardrail/atlas-admins` (placeholder — swap in the real admin team). GitHub then requires a review
   from that team on any PR that touches the policy.
2. **Enforcement — branch protection.** CODEOWNERS is only advisory until branch protection makes the
   code-owner review *required to merge*.

## Who may do what

- **Anyone may propose.** Open a PR editing `.atlas/policy.json`. The loader is fail-closed, so a bad
  proposal cannot degrade safety even if it lands: an absent or malformed policy resolves to the
  conservative `defaultPolicy()` (exact-match near-dup, empty T0 keywords, **empty scopes ⇒ no write
  authorized**; reads stay universal).
- **Only admins ratify.** The merge requires a `@HumanGuardrail/atlas-admins` review. Proposal is open;
  ratification is admin-only — the same shape as Atlas T0 human-ratification.

## Admin setup (enable these branch-protection toggles once)

On the default branch (Settings → Branches → branch protection rule, or the rulesets equivalent):

- **Require a pull request before merging** — no direct pushes to the protected branch.
- **Require review from Code Owners** — this is what makes the CODEOWNERS entry binding for
  `.atlas/policy.json`.
- **Require status checks to pass** — include the policy/adapter-io gate so a malformed policy is caught in
  CI, not at runtime.
- **Do not allow bypassing the above settings** (apply to admins too) — otherwise the lock is optional.

Until an admin enables these toggles, CODEOWNERS is advisory only. The runtime remains safe regardless
(fail-closed default), but the *lock* is not in force until branch protection requires the code-owner review.
