# harness — the governed-execution machinery

This directory is **not** part of the Atlas product. It is the reusable *harness* that
governs how Atlas (and any future layer) is decomposed, built, gated, and shipped. It is
staged here so it can be lifted out cleanly into its own sibling repo — `/HuGR/orchestra` —
with a single `git mv`.

## What the harness IS

The machinery of governed execution, independent of any one product:

- **Quality gates** — `harness/gates/`. The standing bars enforced on every seat and on the
  build itself. Today: `godfile-guard.mjs` (the ≤400-LOC ceiling per source file). Same
  doctrine as the CI: the bar Orchestra enforces on seats is enforced on Orchestra itself.
- **The execution method** — the governed pipeline `S0 → S1 → S2 → S3 → C → S4` plus the
  per-work-package execution loop `BIND → RED → GREEN → REFACTOR → GATE → SEAL`. These live
  as prompt + protocol docs under `docs/` (see the inventory below); they are harness-owned
  in-place.
- **Test-harness conventions** — the held-out **GATE** discipline and the **golden → test**
  convention (goldens are compiled into acceptance/heldout tests; a seat cannot see the
  held-out cases while building). Doctrine documented under `docs/CONVENTIONS.md` and the
  method docs; the mechanics ride in each package's own test files.
- **Governed CI/CD** — `.github/workflows/*`. `ci.yml` is the product build gate (it *runs*
  the harness gates against Atlas); `release.yml` is the CD skeleton. The workflow files are
  infra that belongs to the harness even while they gate the product.

## The extraction plan (→ `/HuGR/orchestra`)

When Orchestra becomes its own repo, the split is mechanical and one-way:

1. `git mv harness/ ../orchestra/harness/` (or to the repo root of `orchestra`) — the gates
   move as-is.
2. Migrate the method docs listed in the inventory below out of Atlas `docs/` and into
   Orchestra. **They are not physically moved now** because the frozen WP cards reference them by
   pointer + content digest; moving them today would break that reference graph. At split
   time the cards are re-pointed and the digests re-anchored in one pass.
3. Move `.github/workflows/*` into Orchestra as the governed CI/CD templates; Atlas keeps a
   thin consumer copy that installs the harness as dev tooling.

Direction of the split is fixed: **Atlas depends on the harness, never the reverse.**

## The INVARIANT (one-way dependency)

> Harness code MUST NOT import `@atlas/*` product code.

Atlas consumes the harness purely as **dev tooling** (a `package.json` script invokes
`harness/gates/godfile-guard.mjs`; CI invokes the gates). The harness reasons about the repo
from the *outside* — it reads tracked files via `git ls-files`, it does not link Atlas
internals. This keeps the future `git mv` a clean lift: nothing in `harness/` resolves an
`@atlas/*` module, so nothing breaks when it leaves.

Verify at any time:

```sh
grep -rn "@atlas/" harness/   # must return nothing
```

## Inventory — harness-owned docs that stay in-place (for now)

Declared harness-owned, migrating to Orchestra at split time. Left physically under `docs/`
so the WP-card pointer + digest reference graph stays intact:

| Concern                    | Path                                   |
|----------------------------|----------------------------------------|
| Execution protocol         | `docs/EXECUTION-PROTOCOL.md`           |
| Decomposition protocol     | `docs/DECOMPOSITION-PROTOCOL.md`       |
| Test-harness conventions   | `docs/CONVENTIONS.md`                  |
| Method overview            | `docs/method/README.md`                |
| Pipeline stage prompts     | `docs/method/prompts/{S0,S1,S2,S3,C,S4}.md` |
| Review prompt              | `docs/method/prompts/review.md`        |
| Per-WP execution prompts   | `docs/method/prompts/exec/{BIND,RED,GREEN,REFACTOR,GATE,SEAL}.md` |
| WP / properties templates  | `docs/method/{wp-template.md,properties-template.md,product-design.md}` |

Everything else under `docs/` (requirements, roadmap, spec, reference, ADRs, design) is
**Atlas product** and stays with Atlas.
