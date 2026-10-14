import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

/* Alias "@/" di tsconfig: i moduli sotto src/ lo usano ovunque. */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
