"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("../utils/core");
describe('Core Utils (JS fallbacks)', () => {
    describe('encodeBase62', () => {
        it('should encode 0 as "0"', () => {
            expect((0, core_1.encodeBase62)(0)).toBe('0');
        });
        it('should encode positive numbers', () => {
            expect((0, core_1.encodeBase62)(1)).toBe('1');
            expect((0, core_1.encodeBase62)(61)).toBe('z');
            expect((0, core_1.encodeBase62)(62)).toBe('10');
            expect((0, core_1.encodeBase62)(123456)).toBe('W7E');
        });
    });
    describe('decodeBase62', () => {
        it('should decode base62 strings back to numbers', () => {
            expect((0, core_1.decodeBase62)('0')).toBe(0);
            expect((0, core_1.decodeBase62)('1')).toBe(1);
            expect((0, core_1.decodeBase62)('z')).toBe(61);
            expect((0, core_1.decodeBase62)('10')).toBe(62);
            expect((0, core_1.decodeBase62)('W7E')).toBe(123456);
        });
        it('should return 0 for invalid characters', () => {
            expect((0, core_1.decodeBase62)('!@#')).toBe(0);
        });
    });
    describe('generateUniqueId', () => {
        it('should generate unique IDs', () => {
            const ids = new Set();
            for (let i = 0; i < 10; i++) {
                ids.add((0, core_1.generateUniqueId)());
            }
            expect(ids.size).toBe(10);
        });
        it('should generate numbers', () => {
            const id = (0, core_1.generateUniqueId)();
            expect(typeof id).toBe('number');
            expect(id).toBeGreaterThan(0);
        });
    });
    describe('hashString', () => {
        it('should return a number', () => {
            const hash = (0, core_1.hashString)('test');
            expect(typeof hash).toBe('number');
        });
        it('should return consistent results for same input', () => {
            expect((0, core_1.hashString)('hello')).toBe((0, core_1.hashString)('hello'));
        });
        it('should return different results for different inputs', () => {
            expect((0, core_1.hashString)('abc')).not.toBe((0, core_1.hashString)('xyz'));
        });
    });
});
//# sourceMappingURL=core.test.js.map