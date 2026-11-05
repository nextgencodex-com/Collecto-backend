// Test env: must be set before any module imports src/config/env.ts.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/collecto_test";
process.env.JWT_ACCESS_SECRET ??= "test-secret-test-secret-test-secret-123";
process.env.CORS_ORIGINS ??= "http://localhost:3000";
process.env.LOG_LEVEL = "silent";
