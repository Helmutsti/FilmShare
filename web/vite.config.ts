import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In sviluppo Vite gira su :5173 e passa le chiamate /api al server Fastify.
// In produzione la dashboard compilata la serve nginx, che fa lo stesso passaggio.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
