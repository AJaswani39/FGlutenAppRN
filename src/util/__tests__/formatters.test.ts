import { formatDistance } from '../formatters';

describe('formatters', () => {
  describe('formatDistance', () => {
    it('returns empty string for invalid distances', () => {
      expect(formatDistance(Number.NaN, false)).toBe('');
      expect(formatDistance(0, false)).toBe('');
      expect(formatDistance(-10, false)).toBe('');
    });

    it('formats miles and feet correctly', () => {
      expect(formatDistance(90, true)).toBe('295 ft');
      expect(formatDistance(1609.34, true)).toBe('1.0 mi');
      expect(formatDistance(3218.68, true)).toBe('2.0 mi');
    });

    it('formats kilometers and meters correctly', () => {
      expect(formatDistance(500, false)).toBe('500 m');
      expect(formatDistance(1000, false)).toBe('1.0 km');
      expect(formatDistance(1400, false)).toBe('1.4 km');
    });
  });
});
