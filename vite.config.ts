import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { notBundle } from 'vite-plugin-electron/plugin'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          plugins: [notBundle()],
          build: {
            rolldownOptions: {
              external: ['@huggingface/transformers'],
            },
          },
        },
        onstart: async ({ startup }) => {
          if (mode === 'desktop') await startup()
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            rolldownOptions: {
              output: {
                format: 'cjs',
                codeSplitting: false,
                entryFileNames: '[name].cjs',
                chunkFileNames: '[name].cjs',
              },
            },
          },
        },
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'electron/**/*.test.ts'],
    setupFiles: './src/setupTests.ts',
  },
}))
