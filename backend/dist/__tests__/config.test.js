"use strict";
describe('validateConfig', () => {
    const OLD_ENV = { ...process.env };
    afterEach(() => {
        process.env = { ...OLD_ENV };
    });
    it('should throw when JWT_SECRET is not set', () => {
        delete process.env.JWT_SECRET;
        const { validateConfig } = require('../config');
        expect(validateConfig).toThrow('Required environment variables are not set');
    });
    it('should throw when JWT_SECRET is empty string', () => {
        process.env.JWT_SECRET = '';
        const { validateConfig } = require('../config');
        expect(validateConfig).toThrow('Required environment variables are not set');
    });
    it('should pass when JWT_SECRET is set', () => {
        process.env.JWT_SECRET = 'this-is-a-test-secret-key-that-is-long-enough';
        const { validateConfig } = require('../config');
        expect(validateConfig).not.toThrow();
    });
    it('should reject JWT_SECRET shorter than 32 characters', () => {
        process.env.JWT_SECRET = 'short';
        const { validateConfig } = require('../config');
        expect(validateConfig).toThrow('at least 32 characters');
    });
    it('should pass with exactly 32-character JWT_SECRET', () => {
        process.env.JWT_SECRET = 'a'.repeat(32);
        const { validateConfig } = require('../config');
        expect(validateConfig).not.toThrow();
    });
});
describe('config object', () => {
    const OLD_ENV = { ...process.env };
    beforeEach(() => {
        jest.resetModules();
    });
    afterEach(() => {
        process.env = { ...OLD_ENV };
    });
    it('should use provided JWT_SECRET', () => {
        process.env.JWT_SECRET = 'provided-secret-value';
        const { config } = require('../config');
        expect(config.jwtSecret).toBe('provided-secret-value');
    });
    it('should default to empty string when JWT_SECRET is not set', () => {
        delete process.env.JWT_SECRET;
        const { config } = require('../config');
        expect(config.jwtSecret).toBe('');
    });
    it('should parse numeric configs correctly', () => {
        process.env.PORT = '4000';
        process.env.MACHINE_ID = '2';
        process.env.RATE_LIMIT_PER_MINUTE = '100';
        process.env.LRU_CACHE_CAPACITY = '50000';
        const { config } = require('../config');
        expect(config.port).toBe(4000);
        expect(config.machineId).toBe(2);
        expect(config.rateLimitPerMinute).toBe(100);
        expect(config.lruCacheCapacity).toBe(50000);
    });
});
//# sourceMappingURL=config.test.js.map