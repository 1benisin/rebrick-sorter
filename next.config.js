/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['googleusercontent.com', 'oaidalleapiprodscus.blob.core.windows.net', 'cdn.openai.com'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Treat 'serialport' as an external module when on the server
      config.externals.push('serialport');
    }
    return config;
  },
};

module.exports = nextConfig;
