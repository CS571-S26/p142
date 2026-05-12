import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'


// https://vite.dev/config/
export default defineConfig({
  base: '/SpinDeck/',
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
  },
  build: {
    outDir: 'docs',
  },
})
