/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdfjs-dist's Node build path pulls in an optional 'canvas' dependency
    // we don't need in the browser bundle.
    config.resolve.fallback = { ...config.resolve.fallback, canvas: false };
    return config;
  },
};

module.exports = nextConfig;
