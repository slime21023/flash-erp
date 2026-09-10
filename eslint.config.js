let tseslint
try {
  tseslint = (await import('typescript-eslint')).default
} catch {
  // typescript-eslint not installed
}

export default tseslint
  ? tseslint.config(
      {
        ignores: [
          'dist/**',
          '**/dist/**',
          'build/**',
          'coverage/**',
          'node_modules/**',
          '.adonisjs/**',
          'app/**',
          'commands/**',
          'start/**',
          'config/**',
          'bin/**',
        ],
      },
      ...tseslint.configs.recommended,
      {
        rules: {
          '@typescript-eslint/no-explicit-any': 'off',
          '@typescript-eslint/no-unused-vars': 'off',
          'no-console': 'off',
        },
      }
    )
  : [
      {
        ignores: [
          'dist/**',
          '**/dist/**',
          'build/**',
          'coverage/**',
          'node_modules/**',
          '.adonisjs/**',
          'app/**',
          'commands/**',
          'start/**',
          'config/**',
          'bin/**',
        ],
      },
      {
        files: ['**/*.js', '**/*.mjs'],
        rules: {
          'no-unused-vars': 'off',
          'no-undef': 'off',
          'no-console': 'off',
        },
      },
    ]
