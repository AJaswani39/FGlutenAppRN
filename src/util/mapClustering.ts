import { Restaurant } from '../types/restaurant';

export interface MapCluster {
  id: string;
  latitude: number;
  longitude: number;
  points: Restaurant[];
  count: number;
}

/**
 * Lightweight grid-based clustering for the map.
 *
 * `react-native-maps` 1.27 does not ship a native `Cluster` component, so we
 * bucket pins into a coarse latitude/longitude grid whose cell size is derived
 * from the current map zoom. Points that land in the same cell are merged into
 * a single cluster; the cluster's coordinate is the average of its members.
 *
 * The grid cell size scales with the region delta so that, at any zoom level,
 * the map shows a reasonable number of cells. A small floor prevents
 * pathological fragmentation when the user zooms way in.
 */
export function buildMapClusters(
  restaurants: Restaurant[],
  region: { latitudeDelta: number; longitudeDelta: number } | null
): MapCluster[] {
  const withCoords = restaurants.filter(
    (restaurant) =>
      Number.isFinite(restaurant.latitude) && Number.isFinite(restaurant.longitude)
  );

  if (withCoords.length === 0) return [];
  if (withCoords.length === 1 || !region) {
    return withCoords.map((restaurant) => ({
      id: restaurant.placeId || `${restaurant.latitude},${restaurant.longitude}`,
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
      points: [restaurant],
      count: 1,
    }));
  }

  // ~80 cells across the visible region, with an 11 m floor so deeply zoomed
  // views don't fragment into thousands of single-pin cells.
  const CELLS_ACROSS = 80;
  const MIN_CELL_DEGREES = 0.0001;
  const cellLat = Math.max(MIN_CELL_DEGREES, region.latitudeDelta / CELLS_ACROSS);
  const cellLon = Math.max(MIN_CELL_DEGREES, region.longitudeDelta / CELLS_ACROSS);

  const buckets = new Map<string, Restaurant[]>();

  for (const restaurant of withCoords) {
    // Math.trunc (not Math.floor) so negative longitudes bucket correctly.
    // -74.00001 / 0.00625 = -11840.0016 → trunc → -11840, same as -74.00.
    const key = `${Math.trunc(restaurant.latitude / cellLat)}:${Math.trunc(
      restaurant.longitude / cellLon
    )}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.push(restaurant);
    } else {
      buckets.set(key, [restaurant]);
    }
  }

  const clusters: MapCluster[] = [];
  for (const [key, points] of buckets) {
    let latSum = 0;
    let lonSum = 0;
    for (const point of points) {
      latSum += point.latitude;
      lonSum += point.longitude;
    }
    const count = points.length;
    clusters.push({
      id: key,
      latitude: latSum / count,
      longitude: lonSum / count,
      points,
      count,
    });
  }

  return clusters;
}