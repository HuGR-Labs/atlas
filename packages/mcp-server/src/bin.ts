#!/usr/bin/env node
import { assembleHandler } from '@atlas/adapter-io';
import { createMcpServer } from './server.js';
void createMcpServer(assembleHandler({ repoPath: '.', casPath: '.atlas/cas' })).start();
