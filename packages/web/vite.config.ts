import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the UI and API run separately; proxy so the UI can still
    // call the API on its own origin, exactly as it does in production.
    proxy: {
      '/process': api,
      '/metadata': api,
      '/healthz': api,
    },
  },
});
