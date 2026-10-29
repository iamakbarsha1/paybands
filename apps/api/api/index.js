// Vercel turns each file under `api/` into a function, and this one is deliberately a
// re-export rather than the handler itself.
//
// The platform's bundler traces imports; it does not transpile them. `@paybands/core` ships
// TypeScript source and no build (see its package.json), so a function that imported it
// through the workspace would ship a `.ts` file into a Node runtime. `tsup` already bundles
// core into its output for exactly this reason, so the function is pointed at the build
// instead and there is one bundler in the chain rather than two.
//
// `pnpm build` writes `dist/vercel.js`, and `vercel.json` runs it before this is bundled.
export { default } from '../dist/vercel.js';
