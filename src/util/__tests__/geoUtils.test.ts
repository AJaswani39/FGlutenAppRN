import { distanceBetween } from '../geoUtils';

describe('geoUtils', () => {
  it('calculates geographic distance correctly', () => {
    // Same location should be 0
    expect(distanceBetween(40.7128, -74.006, 40.7128, -74.006)).toBeCloseTo(0, 5);
    
    // 0.001 degree lat is ~111 meters
    expect(distanceBetween(40.7128, -74.006, 40.7138, -74.006)).toBeGreaterThan(100);
    expect(distanceBetween(40.7128, -74.006, 40.7138, -74.006)).toBeLessThan(120);
  });
});
