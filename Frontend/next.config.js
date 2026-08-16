// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // En Next.js 15+/16 la propiedad oficial para orígenes permitidos en dev:
  allowedDevOrigins: ['172.19.0.6'],

  // Proxy: redirige /api/* al contenedor del backend, EXCEPTO /api/auth/*
  async rewrites() {
    return [
      // 1. PRIMERO: La regla para /api/auth (NO redirige)
      // Esta tiene prioridad por el orden
      {
        source: '/api/auth/:path*',
        destination: '/api/auth/:path*', // Se mantiene local
      },
      // 2. DESPUÉS: Todas las demás rutas /api/* van al backend
      {
        source: '/api/:path*',
        destination: 'http://backend:3001/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;