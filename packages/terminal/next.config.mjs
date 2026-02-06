/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],
  async rewrites() {
    const interchangeUrl = process.env.INTERCHANGE_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${interchangeUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
