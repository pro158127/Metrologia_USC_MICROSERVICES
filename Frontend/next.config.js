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
    }
  },


};

module.exports = nextConfig;