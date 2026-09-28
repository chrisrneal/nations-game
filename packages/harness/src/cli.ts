#!/usr/bin/env node
/**
 * `npm run harness` entry point.
 *
 * Phase 0: prints a placeholder and exits 0, so CI and the owner can run the
 * command today and see it wired. It becomes the seeded multi-game runner once
 * the sim has a step function.
 */
import { HARNESS_PLACEHOLDER_MESSAGE } from './index.ts';

console.log(HARNESS_PLACEHOLDER_MESSAGE);
console.log('Usage later: npm run harness -- --seeds 200 --archetypes hoarder,isolationist');
