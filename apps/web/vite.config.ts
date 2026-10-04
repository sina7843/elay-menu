import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // Same-origin /api in development, mirroring the nginx proxy in Docker.
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
