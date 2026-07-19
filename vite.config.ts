import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/yurikago/', // GitHub Pagesのリポジトリ名に合わせて変更
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
