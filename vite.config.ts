import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works on any fork's GitHub Pages URL.
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
