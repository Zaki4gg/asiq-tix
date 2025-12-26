import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true, secure: false },
    },
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  
  test: {
    environment: 'jsdom',
    globals: true,
    // jika Anda import CSS di component, ini membantu
    css: true,
    // setup global mocks (optional tapi disarankan)
    setupFiles: './vitest.setup.js',
    // pola file test
    include: ['src/**/*.test.{js,ts}', 'src/**/*.spec.{js,ts}'],
    // coverage (white-box biasanya menonjolkan coverage)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      exclude: ['node_modules/', 'src/main.*', 'src/router/**']
    }
  }
})
