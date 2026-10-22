module.exports = {
  extends: ['expo'],
  ignorePatterns: ['/dist/*', 'node_modules'],
  rules: {
    // strict clean rules
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  },
};
