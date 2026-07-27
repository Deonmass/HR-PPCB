import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  generateBuildId: async () => {
    return process.env.BUILD_ID || `build-${Date.now()}`;
  },
};

export default nextConfig;
