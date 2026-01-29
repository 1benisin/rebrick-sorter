// __tests__/setup.ts

/**
 * Global test setup for Jest.
 * This file is run before each test file.
 */

// Clear all mocks before each test to ensure test isolation
beforeEach(() => {
  jest.clearAllMocks();
});

// Suppress console.log and console.warn during tests unless debugging
// Uncomment the following to enable console output during tests:
// const originalConsole = { ...console };

// Mock console methods to reduce noise during tests
// Comment out specific lines if you need to see those logs
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  // Keep console.error visible for debugging failed tests
  // jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});
