import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Same-origin /api, mirroring the nginx proxy in Docker. API_TARGET lets the browser tests point at their own API.
// Keep the browser's Host header (like nginx does) so the API's same-origin check sees the real origin.
const proxy = { '/api': { target: process.env.API_TARGET ?? 'http://127.0.0.1:3000', changeOrigin: false } };

export default defineConfig({
  plugins: [vue()],
  server: { port: 5173, proxy },
  preview: { proxy },
});
