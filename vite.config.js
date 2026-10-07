import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@firebase/firestore')) return 'firebase-firestore'
          if (id.includes('node_modules/@firebase/auth')) return 'firebase-auth'
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase-core'
          if (id.includes('node_modules/react')) return 'react'
          if (id.includes('node_modules/lucide-react')) return 'icons'
        },
      },
    },
  },
  server: { host: '127.0.0.1', port: 43817, strictPort: true, allowedHosts: ['fitlogic.jamestd.co.uk', 'desktop-tlqdo0m.tail3f359d.ts.net'] },
  preview: { host: '127.0.0.1', port: 43817, strictPort: true, allowedHosts: ['fitlogic.jamestd.co.uk', 'desktop-tlqdo0m.tail3f359d.ts.net'] },
})
