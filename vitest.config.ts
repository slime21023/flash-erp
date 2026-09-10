import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    exclude: ['node_modules', 'dist', 'build'],
    globals: true,
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
