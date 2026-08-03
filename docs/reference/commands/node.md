# `atlas node`

Read one fact back whole, by its content address. `query` gives you a bounded pack of one-line claims;
`node` is the drill-down that shows a single fact's identity, tier, kind and claim. Read-only — it opens no
write path.

This page describes the **CLI** command `atlas node`. There is **no `atlas-node` MCP tool**.

## Invocation

```
atlas node <addr>
```

- `<addr>` — required. The **content address** of a stored fact: exactly 64 lowercase hex characters.
- No flags.

### Which identifier is this?

Atlas has two 64-hex identifiers for a fact and they are not interchangeable. Getting this wrong is the
most likely reason a `node` lookup misses.

| identifier | what prints it | what takes it |
| --- | --- | --- |
| **content address** | `atlas emit` → `data.id`; `atlas doctor archive` | `atlas node` |
| **nodeKey** | `atlas query` → the `inv` lines; the `id` field inside a fact JSON file | `atlas link`, `atlas doctor why`, `atlas doctor reground` |

## Worked example

```
$ atlas node 20512b7622b0d8864f20311700f4091b991ea5317797ce6158371d06adca0b06
status: ok
next: a node is reached as a drill-down within its pack; the same address resolves byte-identically over MCP | poke | CLI
invariant: TOOLS-10: one read-only oracle, no divergence across transports, no write path
data:
  node: f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
  tier: T1
  kind: advisory
  claim: greet returns a non-empty string
# exit 0
```

Note the two values: the address you passed is the content address; the `node:` field it prints back is the
nodeKey.

The same fact's nodeKey, passed as an address, misses:

```
$ atlas node f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532
status: error
next: a node is reached as a drill-down within its pack; the same address resolves byte-identically over MCP | poke | CLI
invariant: TOOLS-10: one read-only oracle, no divergence across transports, no write path
reason: no-such-node: no grounded node at content address 'f9517988f330a775ffc767c072fa01e52f38642220442916ca6b9b8c20bef532'
# exit 1
```

## Exit codes

| code | meaning |
| --- | --- |
| `0` | the fact resolved |
| `1` | no such node, a malformed address, or a runtime that is not composed |
| `2` | a governance gate refused the read (the committed-store tripwire) |

## What it refuses, and why

**A miss is a structured refusal, not a crash.** `resolveNode` is total; an unknown address renders
`no-such-node: …` with the address quoted and exits `1`.

**Anything that is not 64 lowercase hex.** The address is attacker-controllable over other transports, so
it is charset-checked *before* any filesystem read and the guard is re-applied in the store. A path
traversal is simply a miss:

```
$ atlas node ../../etc/passwd
status: error
[…]
reason: no-such-node: no grounded node at content address '../../etc/passwd'
# exit 1
```

**A committed durable store.** `node` reads CAS by content address directly, bypassing the projection where
the tripwire normally lives — so the refusal is applied on this leg explicitly. Without it, a committed blob
came back whole with `ok:true` while every write door was denying. See [`query`](./query.md) for the text.

**Writing.** `node` resolves through a read-only port with no store-mutating method. Writes funnel through
[`emit`](./emit.md) and [`link`](./link.md); there is no third door.

## Transport differences

`node` is **CLI-only**. Verified against the real MCP stdio server: `tools/list` returns `atlas-init`,
`atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link` — no `atlas-node`. The guidance line above
mentions "MCP | poke | CLI" because the underlying `resolveNode` oracle is transport-agnostic; the *tool*
that would expose it over MCP is `READ_SURFACE`, which has no export site yet (campaign 10, not built).

## Related

- [`query`](./query.md) — the pack a node is a drill-down within.
- [`doctor`](./doctor.md) — `archive` is where you get content addresses for facts you did not just emit.
