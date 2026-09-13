import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev, l'API Node tourne sur :3000 (node server/index.js) ; en prod, même origine.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/healthz': 'http://localhost:3000',
    },
  },
});
