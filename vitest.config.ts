import { defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

// Tests run in Node with an in-memory IndexedDB, so schema, rules and backup
// can be checked without a browser.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
