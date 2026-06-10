import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Run the Anthropic SDK as a native Node.js module on the server,
  // preventing webpack from bundling it (it uses native Node APIs).
  serverExternalPackages: ['@anthropic-ai/sdk'],
}

export default nextConfig
