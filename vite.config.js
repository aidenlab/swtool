import { defineConfig } from 'vite'

export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern',      // avoids the [legacy-js-api] deprecation
        quietDeps: true,    // suppresses deprecation warnings from node_modules (Bootstrap)
      },
    },
  },
  optimizeDeps: {
    exclude: ['h5wasm'],
  },
})
