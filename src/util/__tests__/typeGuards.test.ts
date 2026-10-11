import { isRecord } from '../typeGuards';

describe('typeGuards', () => {
  describe('isRecord', () => {
    it('accepts plain objects', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ a: 1 })).toBe(true);
    });

    it('accepts class instances since they are still objects', () => {
      expect(isRecord(new Date())).toBe(true);
    });

    it('rejects null', () => {
      expect(isRecord(null)).toBe(false);
    });

    it('rejects arrays', () => {
      expect(isRecord([])).toBe(false);
      expect(isRecord([1, 2])).toBe(false);
    });

    it('rejects primitives', () => {
      expect(isRecord('string')).toBe(false);
      expect(isRecord(42)).toBe(false);
      expect(isRecord(true)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
    });

    it('rejects functions', () => {
      expect(isRecord(() => {})).toBe(false);
    });
  });
});
