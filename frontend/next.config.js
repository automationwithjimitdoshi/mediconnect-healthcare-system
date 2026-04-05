/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip TypeScript type checking during build
  typescript: {
    ignoreBuildErrors: true,
  },
  // Skip ESLint during build  
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Use standalone output for better compatibility
  output: 'standalone',
  // Disable static optimization for pages using client-side APIs
  experimental: {
    // Force all pages to be server-side rendered, not statically generated
  },
};

module.exports = nextConfig;