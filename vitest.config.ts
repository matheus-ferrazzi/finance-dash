import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // os testes de integração recriam o mesmo schema: com banco, um arquivo por vez
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
