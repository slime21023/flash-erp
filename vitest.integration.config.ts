import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    include: ['tests/postgres.integration.spec.ts'],
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@platform': resolve(__dirname, './src/platform'),
      '@modules': resolve(__dirname, './src/modules'),
      '#platform': resolve(__dirname, './src/platform'),
      '#modules': resolve(__dirname, './src/modules'),
      '@': resolve(__dirname, './src'),
    },
  },
})
