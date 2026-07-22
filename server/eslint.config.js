const security = require('eslint-plugin-security')

module.exports = [
  {
    ignores: ['node_modules/**', 'public/**', 'backups/**', 'recordings/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        Buffer: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
      },
    },
    ...security.configs.recommended,
  },
]
