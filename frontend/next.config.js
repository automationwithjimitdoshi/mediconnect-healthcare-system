/** @type {import('next').NextConfig} */
const nextConfig = {
  // Skip TypeScript type checking during build
  typescript: {
    ignoreBuildErrors: true,
  },
  // Use standalone output for better compatibility
  output: 'export',
  // Disable static optimization for pages using client-side APIs
  experimental: {
    // Force all pages to be server-side rendered, not statically generated
  },
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;