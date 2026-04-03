import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  eslintPluginPrettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.output/**',
      'apps/frontend/src/routeTree.gen.ts',
      'apps/frontend/src/app/lib/api/v1.d.ts',
      'apps/frontend/scripts/**',
      'apps/backend/swagger-output/**',
      'apps/backend/generated/**',
      '**/*.d.ts',
    ],
  },
)
