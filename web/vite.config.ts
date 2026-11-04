import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In sviluppo Vite gira su :5173 e passa le chiamate /api al server Fastify.
// In produzione la dashboard compilata (web/dist) la serve direttamente il server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
