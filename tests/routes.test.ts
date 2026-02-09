/**
 * Route Registry Tests
 * 
 * Validates route definitions are consistent and well-formed
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { routes, getRouteCountsByCategory, getRoutesByCategory } from '../src/server/routes.ts';

describe('routes', () => {
  describe('route definitions', () => {
    it('has no duplicate paths for same method', () => {
      const seen = new Set<string>();
      for (const route of routes) {
        const key = `${route.method}:${route.path}`;
        assert.ok(!seen.has(key), `Duplicate route: ${key}`);
        seen.add(key);
      }
    });

    it('all paths start with /', () => {
      for (const route of routes) {
        assert.ok(route.path.startsWith('/'), `Path should start with /: ${route.path}`);
      }
    });

    it('all handlers are named correctly', () => {
      for (const route of routes) {
        assert.ok(
          route.handler.startsWith('handle'),
          `Handler should start with 'handle': ${route.handler}`
        );
      }
    });

    it('all methods are valid HTTP methods', () => {
      const validMethods = ['GET', 'POST', 'PUT', 'DELETE'];
      for (const route of routes) {
        assert.ok(
          validMethods.includes(route.method),
          `Invalid method: ${route.method}`
        );
      }
    });
  });

  describe('getRouteCountsByCategory', () => {
    it('returns counts for all categories', () => {
      const counts = getRouteCountsByCategory();
      assert.ok(Object.keys(counts).length > 0, 'Should have at least one category');
      
      // Verify total matches routes length
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      assert.strictEqual(total, routes.length);
    });
  });

  describe('getRoutesByCategory', () => {
    it('returns bot routes', () => {
      const botRoutes = getRoutesByCategory('bot');
      assert.ok(botRoutes.length > 0, 'Should have bot routes');
      assert.ok(botRoutes.every(r => r.category === 'bot'));
    });

    it('returns agent routes', () => {
      const agentRoutes = getRoutesByCategory('agent');
      assert.ok(agentRoutes.length > 0, 'Should have agent routes');
      assert.ok(agentRoutes.every(r => r.category === 'agent'));
    });

    it('returns empty array for unknown category', () => {
      const unknownRoutes = getRoutesByCategory('unknown' as any);
      assert.strictEqual(unknownRoutes.length, 0);
    });
  });
});
