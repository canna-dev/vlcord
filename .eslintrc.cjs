module.exports = {
  env: {
    browser: false,
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    'no-console': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-useless-escape': 'off', // Regex patterns use many character escapes that are valid
  },
};
