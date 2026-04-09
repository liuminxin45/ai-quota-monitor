import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import manifest from './src/manifest.json'

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        crx({ manifest }),
    ],
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                sidepanel: 'src/sidepanel/index.html',
                popup: 'src/popup/index.html',
            },
        },
    },
    server: {
        port: 5173,
        strictPort: true,
        hmr: {
            clientPort: 5173,
        },
    },
})
