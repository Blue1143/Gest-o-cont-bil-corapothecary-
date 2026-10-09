import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { sourcemap: false, chunkSizeWarningLimit: 600 },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./test/setup.ts'], include: ['src/**/*.test.{ts,tsx}'], css: false },
});
