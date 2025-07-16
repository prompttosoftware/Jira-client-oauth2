import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // a global setup file, will be run once before all tests
    globalSetup: './tests/integration/jira/globalSetup.ts',
    // other config...
    silent: false,
    onConsoleLog: (log, type) => {
      return true; // Show all console types
    },
  },
});
