/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Pure logic only (src/lib/*.test.ts): no DOM needed.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
