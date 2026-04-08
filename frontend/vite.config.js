import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // In production the frontend is built and served by the Express backend
  // at the same origin, so /api calls go to the same host — no proxy needed.
  // In local dev (npm run dev), proxy /api to the backend running on 3000.
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
