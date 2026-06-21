/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['cheerio', 'jsdom', '@mozilla/readability'],
  },
  // Allow large response bodies for webpage fetching
  serverRuntimeConfig: {
    maxBodySize: 5 * 1024 * 1024,
  },
}

module.exports = nextConfig
