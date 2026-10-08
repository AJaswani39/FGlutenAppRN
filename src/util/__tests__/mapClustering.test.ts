import { buildMapClusters } from '../mapClustering';
import { Restaurant } from '../../types/restaurant';

function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    placeId: 'place',
    name: 'Cafe',
    address: '123 Main',
    latitude: 0,
    longitude: 0,
    rating: null,
    openNow: null,
    hasGFMenu: false,
    gfMenu: [],
    distanceMeters: 0,
    menuUrl: null,
    rawMenuText: null,
    menuScanStatus: 'NOT_STARTED',
    menuScanTimestamp: 0,
    favoriteStatus: null,
    ...overrides,
  };
}

describe('mapClustering', () => {
  it('returns a single point when there is only one restaurant', () => {
    const r = restaurant({ placeId: 'a', latitude: 1, longitude: 2 });
    const clusters = buildMapClusters([r], { latitudeDelta: 0.08, longitudeDelta: 0.08 });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(1);
    expect(clusters[0].latitude).toBe(1);
    expect(clusters[0].longitude).toBe(2);
  });

  it('returns an empty array when no restaurants have coordinates', () => {
    const r = restaurant({ placeId: 'a', latitude: Number.NaN, longitude: Number.NaN });
    expect(buildMapClusters([r], { latitudeDelta: 0.08, longitudeDelta: 0.08 })).toEqual([]);
  });

  it('merges nearby pins into a cluster when the region is zoomed out', () => {
    const a = restaurant({ placeId: 'a', latitude: 40.71, longitude: -74.00 });
    const b = restaurant({ placeId: 'b', latitude: 40.71001, longitude: -74.00001 });
    const c = restaurant({ placeId: 'c', latitude: 40.72, longitude: -74.01 });

    // Zoomed-out region (large deltas) → grid cells are coarse, so a & b merge.
    const clusters = buildMapClusters([a, b, c], {
      latitudeDelta: 0.5,
      longitudeDelta: 0.5,
    });

    expect(clusters).toHaveLength(2);
    const merged = clusters.find((cluster) => cluster.count === 2);
    expect(merged).toBeDefined();
    expect(merged!.points.map((p) => p.placeId).sort()).toEqual(['a', 'b']);
  });

  it('keeps pins separate when the region is zoomed in', () => {
    const a = restaurant({ placeId: 'a', latitude: 40.71, longitude: -74.00 });
    const b = restaurant({ placeId: 'b', latitude: 40.711, longitude: -74.001 });

    // Zoomed-in region (tiny deltas) → grid cells are fine, so pins stay separate.
    const clusters = buildMapClusters([a, b], {
      latitudeDelta: 0.001,
      longitudeDelta: 0.001,
    });

    expect(clusters).toHaveLength(2);
    expect(clusters.every((cluster) => cluster.count === 1)).toBe(true);
  });

  it('places the cluster coordinate at the average of its members', () => {
    const a = restaurant({ placeId: 'a', latitude: 40.0, longitude: -74.0 });
    const b = restaurant({ placeId: 'b', latitude: 42.0, longitude: -74.0 });

    // Large region → coarse grid cells → both pins land in the same cell.
    const clusters = buildMapClusters([a, b], {
      latitudeDelta: 200,
      longitudeDelta: 200,
    });
    const merged = clusters.find((cluster) => cluster.count === 2);
    expect(merged).toBeDefined();
    expect(merged!.latitude).toBeCloseTo(41, 5);
    expect(merged!.longitude).toBeCloseTo(-74, 5);
  });
});