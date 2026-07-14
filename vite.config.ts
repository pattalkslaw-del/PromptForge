import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The xAI key is NEVER exposed to the browser. The client calls the same-origin
// path /xai/... and this dev-server proxy forwards to https://api.x.ai with the
// Authorization header injected here, server-side, from the container environment.
const XAI_KEY = process.env.XAI_API_KEY || '';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/xai': {
        target: 'https://api.x.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/xai/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            if (XAI_KEY) proxyReq.setHeader('Authorization', 'Bearer ' + XAI_KEY);
          });
        },
      },
    },
  },
});
