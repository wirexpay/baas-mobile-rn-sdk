module.exports = {
  preset: 'react-native',
  // `@noble/secp256k1` ships ES modules only, so Jest has to transform it like the RN packages.
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native(-community)?|@noble)/)'],
  // Tests never read a tester's e2e.local.json; they hand the loader their own values.
  moduleNameMapper: {'^\\./e2e\\.local\\.json$': '<rootDir>/jest/emptyModule.js'},
};
