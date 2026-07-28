import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  generateBuildId: async () => {
    return process.env.BUILD_ID || `build-${Date.now()}`;
  },
  // Inclure les classeurs Excel / templates / seeds dans le bundle serverless Vercel.
  outputFileTracingIncludes: {
    '/api/**/*': [
      './Excel/**/*',
      './data/auth/permissions.json',
      './data/guest-house/store.json',
      './data/employees/**/*',
      './data/dependants/**/*',
      './data/village/**/*',
      './data/factures-fournisseurs/**/*',
      './data/projects/**/*',
      './data/overtimes/**/*',
      './data/travel/**/*',
      './data/charroi/**/*',
      './data/employees.json',
      './data/projects.json',
    ],
    '/*': [
      './Excel/**/*',
      './data/auth/permissions.json',
      './data/guest-house/store.json',
      './data/employees/**/*',
      './data/dependants/**/*',
      './data/village/**/*',
      './data/factures-fournisseurs/**/*',
      './data/projects/**/*',
      './data/overtimes/**/*',
      './data/travel/**/*',
      './data/charroi/**/*',
    ],
  },
};

export default nextConfig;
