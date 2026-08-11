import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // .claude/worktrees is where the agent worktrees live; without it vitest
    // collects the Playwright specs inside them and four files fail to load.
    exclude: ['e2e/**', 'node_modules/**', 'mobile/**', '.worktrees/**', '.claude/**'],
  },
  resolve: {
    alias: { '@': resolve(__dirname) },
  },
});
