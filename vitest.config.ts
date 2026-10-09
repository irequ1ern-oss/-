import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'obsidian/**/*.test.ts'],
    environment: 'node',
  },
});
