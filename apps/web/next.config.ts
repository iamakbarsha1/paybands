import type { NextConfig } from 'next';

const config: NextConfig = {
  // @paybands/core ships source, not a build, so Next compiles it.
  transpilePackages: ['@paybands/core'],
  typedRoutes: true,
  // Next writes an AGENTS.md of its own on every build. The conventions in this repo are
  // written down in docs/ and reviewed; a generated file nobody read is not one of them.
  agentRules: false,
};

export default config;
