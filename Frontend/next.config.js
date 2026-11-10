// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // allowedDevOrigins es útil en desarrollo para los assets estáticos
  allowedDevOrigins: [
    'localhost:3000',
    'qcwngnfx-3000.use2.devtunnels.ms',
    '*.devtunnels.ms'
  ],

  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'qcwngnfx-3000.use2.devtunnels.ms',
        '*.devtunnels.ms'
      ]
    },
    // Reduce el grafo de módulos de librerías pesadas en desarrollo.
    optimizePackageImports: ['recharts', 'xlsx', 'exceljs', 'lucide-react']
  },

  webpack: (config, { dev }) => {
    // Caché persistente en sistema de archivos: evita recompilar módulos pesados
    // en cada recarga/arranque del dev server.
    if (dev) {
      config.cache = { type: 'filesystem' };
    }
    return config;
  },


};

module.exports = nextConfig;