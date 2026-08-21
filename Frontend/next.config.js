// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // En Next.js 16 se declaran los orígenes válidos (IPs locales y del contenedor)
  allowedDevOrigins: [
    '192.168.1.3',
    'localhost:3000',
    '127.0.0.1',
    '172.18.0.6',
    '172.18.0.*', // Comodín para toda la subred de Docker
  ],

  async rewrites() {
    return [
      {
        // Redirige todo /api/* EXCEPTO /api/auth/* usando Negative Lookahead
        source: '/api/:path((?!auth).*)*',
        destination: 'http://backend:3001/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;