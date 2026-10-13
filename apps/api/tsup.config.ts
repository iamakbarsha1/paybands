import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // @paybands/core ships source, not a build, so it is compiled into this bundle.
  noExternal: ['@paybands/core'],
});
