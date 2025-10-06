import { beforeAll, afterAll } from 'vitest';

// Setup test environment
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';

  // Mock performance.now if not available
  if (typeof performance === 'undefined') {
    (global as Record<string, unknown>).performance = {
      now: () => Date.now()
    };
  }

  // Setup console for better test output
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    // Add timestamp to console logs in tests
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    originalLog(`[${timestamp}]`, ...args);
  };
});

afterAll(() => {
  // Cleanup
});