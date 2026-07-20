#!/usr/bin/env node
// @atlas/cli — src/bin.ts  (the `atlas` entrypoint: the composed runtime, driven over argv)
//
// The thin production entrypoint: `composeRuntime(process.cwd())` reads the repo at the cwd and returns THE
// one governed durable `WiredHandler`; `main` parses argv, routes through it, and returns a process exit
// code. The handler rides the existing `CliDeps.handler` seam (frozen `main(argv, deps?)` shape unchanged),
// so prod and tests share ONE surface — prod composes the real handler, tests inject a fake (WIRE-1).
import { composeRuntime } from '@atlas/adapter-io';
import { main } from './cli.js';

const handler = composeRuntime(process.cwd());
void main(process.argv.slice(2), { handler }).then((code) => {
  process.exitCode = code;
});
