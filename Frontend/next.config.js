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
      bodySizeLimit: '20mb',
      allowedOrigins: [
        'localhost:3000',
        'qcwngnfx-3000.use2.devtunnels.ms',
        '*.devtunnels.ms'
      ]
    },
    // Reduce el grafo de módulos de librerías pesadas en desarrollo.
    optimizePackageImports: ['recharts', 'xlsx', 'exceljs', 'lucide-react']
  },


};

module.exports = nextConfig;