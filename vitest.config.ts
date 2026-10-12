import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // JSX como o Next compila (runtime automático): permite renderizar componentes nos testes
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // os testes de integração recriam o mesmo schema: com banco, um arquivo por vez
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
