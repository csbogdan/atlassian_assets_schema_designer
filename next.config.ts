import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    typedRoutes: true,
  },
  webpack: (config) => {
    // pg-native is an optional native addon — not available, not needed.
    config.resolve.alias['pg-native'] = false;
    return config;
  },
};

export default nextConfig;
