import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '^/(api|identity|sales|procurement|inventory|finance|treasury|manufacturing|organization|health|ready)':
        'http://localhost:3333',
    },
  },
})
