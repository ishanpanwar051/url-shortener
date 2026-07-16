import { encodeBase62, decodeBase62, generateUniqueId, hashString } from '../utils/core';

describe('Core Utils (JS fallbacks)', () => {
  describe('encodeBase62', () => {
    it('should encode 0 as "0"', () => {
      expect(encodeBase62(0)).toBe('0');
    });

    it('should encode positive numbers', () => {
      expect(encodeBase62(1)).toBe('1');
      expect(encodeBase62(61)).toBe('z');
      expect(encodeBase62(62)).toBe('10');
      expect(encodeBase62(123456)).toBe('W7E');
    });
  });

  describe('decodeBase62', () => {
    it('should decode base62 strings back to numbers', () => {
      expect(decodeBase62('0')).toBe(0);
      expect(decodeBase62('1')).toBe(1);
      expect(decodeBase62('z')).toBe(61);
      expect(decodeBase62('10')).toBe(62);
      expect(decodeBase62('W7E')).toBe(123456);
    });

    it('should return 0 for invalid characters', () => {
      expect(decodeBase62('!@#')).toBe(0);
    });
  });

  describe('generateUniqueId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<number>();
      for (let i = 0; i < 10; i++) {
        ids.add(generateUniqueId());
      }
      expect(ids.size).toBe(10);
    });

    it('should generate numbers', () => {
      const id = generateUniqueId();
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });
  });

  describe('hashString', () => {
    it('should return a number', () => {
      const hash = hashString('test');
      expect(typeof hash).toBe('number');
    });

    it('should return consistent results for same input', () => {
      expect(hashString('hello')).toBe(hashString('hello'));
    });

    it('should return different results for different inputs', () => {
      expect(hashString('abc')).not.toBe(hashString('xyz'));
    });
  });
});
