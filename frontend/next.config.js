/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ignore TypeScript errors during build — project uses JavaScript
  typescript: {
    ignoreBuildErrors: true,
  },
  // Ignore ESLint errors during build
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable telemetry
  experimental: {},
};

module.exports = nextConfig;