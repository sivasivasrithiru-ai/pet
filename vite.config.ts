
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Use type assertion to bypass the "Property 'cwd' does not exist on type 'Process'" error
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
      'process.env.VITE_APP_TITLE': JSON.stringify(env.VITE_APP_TITLE || 'SNACKTIME-PET'),
      'process.env.VITE_DEFAULT_VISIT_LIMIT': JSON.stringify(env.VITE_DEFAULT_VISIT_LIMIT || '5'),
      'process.env.VITE_DEFAULT_LOCK_TIME': JSON.stringify(env.VITE_DEFAULT_LOCK_TIME || '2'),
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          main: './index.html',
        },
      },
    },
  };
});
