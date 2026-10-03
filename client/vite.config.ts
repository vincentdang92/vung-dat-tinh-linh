import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true, // cho phép truy cập dev server qua domain Cloudflare Tunnel
    fs: { allow: ['..'] }, // đọc ../shared
    proxy: {
      '/ws': { target: 'ws://localhost:2567', ws: true },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
