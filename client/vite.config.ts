import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import preact from '@preact/preset-vite';

/**
 * Dev qua Cloudflare Tunnel: Cloudflare tự gắn `max-age=14400` cho file đuôi .css/.js nên điện thoại giữ
 * bản CSS cũ tới 4 tiếng (JS mới + CSS cũ => nút mới không có style, dồn lên góc trên).
 * Ép mọi phản hồi của dev server thành `no-store` (Cloudflare tôn trọng no-store, không cache).
 */
function noStoreInDev(): Plugin {
  return {
    name: 'no-store-in-dev',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        const set = res.setHeader.bind(res);
        res.setHeader = (name, value) => set(name, String(name).toLowerCase() === 'cache-control' ? 'no-store, max-age=0' : value);
        res.setHeader('Cache-Control', 'no-store');
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        const set = res.setHeader.bind(res);
        res.setHeader = (name, value) => set(name, String(name).toLowerCase() === 'cache-control' ? 'no-store, max-age=0' : value);
        res.setHeader('Cache-Control', 'no-store');
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), noStoreInDev()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true, // cho phép truy cập dev server qua domain Cloudflare Tunnel
    fs: { allow: ['..'] }, // đọc ../shared
    proxy: {
      '/ws': { target: 'ws://localhost:2567', ws: true },
      '/api': { target: 'http://localhost:2567' }, // API đăng nhập nhanh
    },
  },
  preview: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/ws': { target: 'ws://localhost:2567', ws: true },
      '/api': { target: 'http://localhost:2567' },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
