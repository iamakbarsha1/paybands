import type { NextConfig } from 'next';

const config: NextConfig = {
  // @paybands/core ships source, not a build, so Next compiles it.
  transpilePackages: ['@paybands/core'],
  typedRoutes: true,
};

export default config;
