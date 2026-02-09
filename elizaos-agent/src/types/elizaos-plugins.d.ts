/**
 * Type declarations for ElizaOS plugins that lack type definitions
 */

declare module '@elizaos/plugin-bootstrap' {
  import type { Plugin } from '@elizaos/core';
  export const bootstrapPlugin: Plugin;
}

declare module '@elizaos/plugin-sql' {
  import type { Plugin } from '@elizaos/core';
  export const plugin: Plugin;
}
