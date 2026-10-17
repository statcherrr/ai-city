import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/engine/**/*.test.ts'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});