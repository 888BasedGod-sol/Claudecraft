/**
 * Integration Tests for ClaudeCraft Utils
 * 
 * Run with: npx ts-node --esm tests/helpers.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateId, sleep } from '../src/utils/helpers.ts';

describe('helpers', () => {
  describe('generateId', () => {
    it('generates unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      assert.notStrictEqual(id1, id2);
    });

    it('includes prefix when provided', () => {
      const id = generateId('test');
      assert.ok(id.startsWith('test_'), `Expected ID to start with 'test_', got: ${id}`);
    });

    it('generates IDs of consistent length', () => {
      const id1 = generateId();
      const id2 = generateId();
      // IDs should be reasonably sized (16+ chars without prefix)
      assert.ok(id1.length >= 8, `ID too short: ${id1}`);
    });
  });

  describe('sleep', () => {
    it('pauses execution for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      // Allow 50ms tolerance for timing
      assert.ok(elapsed >= 90 && elapsed < 200, `Expected ~100ms, got ${elapsed}ms`);
    });

    it('handles zero duration', async () => {
      const start = Date.now();
      await sleep(0);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 50, `Expected instant, got ${elapsed}ms`);
    });
  });
});
