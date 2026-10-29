import { defineConfig } from 'tsup';

export default defineConfig({
  // Two entry points, one app: the long-running server and the platform handler.
  entry: ['src/index.ts', 'src/vercel.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // @paybands/core ships source, not a build, so it is compiled into this bundle.
  noExternal: ['@paybands/core'],
});
