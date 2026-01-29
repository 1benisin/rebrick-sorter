const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Root directories for test discovery
  roots: ['<rootDir>/__tests__'],

  // Test file patterns
  testMatch: ['**/*.test.ts'],

  // Module resolution
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' }),

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],

  // Coverage configuration
  collectCoverageFrom: [
    'server/components/PositionTranslator.ts',
    'server/SystemCoordinator.ts',
    'types/settings.type.ts',
    'types/socketMessage.type.ts',
  ],

  // Coverage thresholds (optional - can be enabled once tests are stable)
  // coverageThreshold: {
  //   global: {
  //     branches: 80,
  //     functions: 80,
  //     lines: 80,
  //     statements: 80,
  //   },
  // },

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/.dist/'],

  // Transform configuration
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },

  // Verbose output for better debugging
  verbose: true,

  // Clear mocks automatically between tests
  clearMocks: true,

  // Detect open handles (useful for debugging async issues)
  detectOpenHandles: true,

  // Force exit after tests complete (helps with hanging tests)
  forceExit: true,
};
