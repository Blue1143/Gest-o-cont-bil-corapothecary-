import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Same-origin /api in development and preview (cookies stay SameSite=Strict, no CORS needed).
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: { sourcemap: false, chunkSizeWarningLimit: 600 },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./test/setup.ts'], include: ['src/**/*.test.{ts,tsx}'], css: false },
});
