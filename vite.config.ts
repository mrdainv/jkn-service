import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { dbFileStore } from './plugins/db-file-store.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), dbFileStore()],
  base: './',
})
