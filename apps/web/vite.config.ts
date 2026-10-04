import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Same-origin /api, mirroring the nginx proxy in Docker. API_TARGET lets the browser tests point at their own API.
const proxy = { '/api': process.env.API_TARGET ?? 'http://127.0.0.1:3000' };

export default defineConfig({
  plugins: [vue()],
  server: { port: 5173, proxy },
  preview: { proxy },
});
