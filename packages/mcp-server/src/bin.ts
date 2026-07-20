#!/usr/bin/env node
import { assembleHandler } from '@atlas/adapter-io';
import { createMcpServer } from './server.js';

// SKELETON entrypoint. The real run assembles a FULL `WireConfig` — including the injected `seams`
// (heuristic / gate / classifier / driftFacts / resolveAnchorAt) that have no adapter — and starts the
// SDK transport. Both land at WP-9.4.7.MCP; deferred here rather than faked (constructing placeholder
// governance seams would be a lie about what is wired). The import edges are pinned so the DAG stays real.
void [assembleHandler, createMcpServer];
throw new Error('unimplemented: MCP bin — wire the full WireConfig + SDK transport at WP-9.4.7.MCP');
