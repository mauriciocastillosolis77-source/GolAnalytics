import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    
    // In Vercel, env vars come from process.env, not .env files
    // Priority: process.env (Vercel) > loadEnv (local .env files)
    const apiKey = process.env.VITE_API_KEY || env.VITE_API_KEY || env.GEMINI_API_KEY;
    
    return {
      server: {
        port: 5000,
        host: '0.0.0.0',
        allowedHosts: true,
        hmr: {
          clientPort: 443,
        },
      },
      plugins: [react()],
      define: {
        // Inject VITE_API_KEY from environment (Vercel uses process.env, local uses .env)
        'import.meta.env.VITE_API_KEY': JSON.stringify(apiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
