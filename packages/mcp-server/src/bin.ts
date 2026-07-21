#!/usr/bin/env node
// @atlas/mcp-server — src/bin.ts  (MCP entrypoint: the composed runtime, served over stdio)
//
// The thin production entrypoint: `composeRuntime(process.cwd())` reads the repo at the cwd (policy, index
// axes, durable CAS) and returns THE one governed durable `WiredHandler`; `createMcpServer` serves it over
// the SDK stdio transport. No per-entrypoint governance is constructed here — the composition root
// (@atlas/adapter-io) owns the seams (COMPOSE-A), this bin owns nothing but the wiring (WIRE-1: CLI ≡ MCP).
import { composeRuntime, initAst } from '@atlas/adapter-io';
import { createMcpServer } from './server.js';

// Warm up the opt-in AST grammar ONCE before composing (F1) — same rationale as the CLI bin: `foldAstUnits`
// (the sync FileTree refinement `composeRuntime` folds before every `build`) only yields `::` sub-file symbol
// nodes after `initAst()` resolves, so a symbol grounding is groundable and `subsumes` fires over MCP too.
void (async () => {
  await initAst();
  const { handler } = composeRuntime(process.cwd());
  await createMcpServer(handler).start();
})();
