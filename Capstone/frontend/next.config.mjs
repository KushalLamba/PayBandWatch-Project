import path from 'path'
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Explicitly set tracing root to this frontend package to avoid Next picking parent lockfile
  outputFileTracingRoot: path.join(process.cwd()),
}

export default nextConfig
