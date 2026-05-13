import { Restaurant } from '../types/restaurant';
import { scanRestaurantMenu } from './menuScanner';
import { getMenuScanTargets, CONCURRENT_SCAN_LIMIT } from '../context/restaurantState';
import { getRestaurantIdentityKey } from '../util/restaurantUtils';

export interface ScanOrchestratorConfig {
  mapsApiKey: string;
  /**
   * Called when a specific restaurant's scan status changes.
   * Returns true if the update was applied (i.e. the restaurant still exists in the list).
   */
  onRestaurantUpdate: (
    target: Restaurant,
    updater: (current: Restaurant) => Restaurant
  ) => boolean;
  /**
   * Called to notify the UI that the overall list or scan progress has changed.
   */
  onNotifyUI: () => void;
  /**
   * Called to persist the current restaurant list to storage.
   */
  onPersist: () => Promise<void>;
  /**
   * Optional callback to get the unique key for a restaurant (used for batch tracking).
   */
  getIdentityKey?: (restaurant: Restaurant) => string | null;
}

/**
 * Orchestrates the lifecycle of restaurant menu scans, including batching,
 * status transitions, and concurrency control.
 */
export class ScanOrchestrator {
  private activeScans = new Set<string>();
  private currentBatchKeys: string[] = [];

  constructor(private config: ScanOrchestratorConfig) {}

  /**
   * Returns the keys of restaurants currently being tracked in the active batch.
   */
  getBatchKeys(): string[] {
    return [...this.currentBatchKeys];
  }

  /**
   * Starts a scan for a single restaurant.
   */
  async scanSingle(restaurant: Restaurant): Promise<void> {
    const id = restaurant.placeId;
    if (!id || this.activeScans.has(id) || !this.config.mapsApiKey) return;

    this.activeScans.add(id);
    const scanStartedAt = Date.now();

    try {
      // 1. Mark as fetching
      const started = this.config.onRestaurantUpdate(restaurant, (current) => ({
        ...current,
        menuScanStatus: 'FETCHING',
        menuScanTimestamp: scanStartedAt,
      }));

      if (!started) return;
      this.config.onNotifyUI();

      // 2. Perform the actual scan
      const result = await scanRestaurantMenu({
        restaurant,
        mapsApiKey: this.config.mapsApiKey,
        scanStartedAt,
      });

      if (!result) return;

      // 3. Apply the results
      const applied = this.config.onRestaurantUpdate(restaurant, (current) => {
        // Ensure we don't overwrite if a newer scan was started
        if (
          current.menuScanStatus !== 'FETCHING' ||
          current.menuScanTimestamp !== scanStartedAt
        ) {
          return current;
        }
        return { ...current, ...result };
      });

      if (applied) {
        this.config.onNotifyUI();
        await this.config.onPersist();
      }
    } finally {
      this.activeScans.delete(id);
    }
  }

  /**
   * Orchestrates scans for a list of restaurants based on TTL and priority.
   */
  async scanBatch(restaurants: Restaurant[]): Promise<void> {
    const targets = getMenuScanTargets(restaurants);
    if (targets.length === 0) return;

    await this.scanBatchByIds(targets, restaurants);
  }

  /**
   * Retries all restaurants that currently have a FAILED scan status.
   */
  async retryFailed(restaurants: Restaurant[]): Promise<void> {
    const targets = restaurants.filter((r) => r.menuScanStatus === 'FAILED');
    if (targets.length === 0) return;

    await this.scanBatchByIds(targets, restaurants);
  }

  /**
   * Internal helper to start a batch scan for specific target restaurants.
   */
  private async scanBatchByIds(targets: Restaurant[], all: Restaurant[]): Promise<void> {
    const getKey = this.config.getIdentityKey || getRestaurantIdentityKey;
    
    // Merge new target keys into current batch tracking
    const newKeys = targets.map((r) => getKey(r)).filter((key): key is string => Boolean(key));
    this.currentBatchKeys = [...new Set([...this.currentBatchKeys, ...newKeys])];

    this.config.onNotifyUI();

    // Rate Limiting Logic:
    // Instead of firing all scans at once, we use a worker pool pattern.
    // This processes CONCURRENT_SCAN_LIMIT restaurants at a time.
    const queue = [...targets];
    const workers = Array(CONCURRENT_SCAN_LIMIT)
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          const restaurant = queue.shift();
          if (restaurant) {
            await this.scanSingle(restaurant);
            // Small stagger to avoid bursting network requests
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }
      });

    await Promise.all(workers);
  }

  /**
   * Forces a rescan for a specific restaurant, clearing previous data.
   */
  async requestRescan(restaurant: Restaurant): Promise<void> {
    const getKey = this.config.getIdentityKey || getRestaurantIdentityKey;
    const key = getKey(restaurant);
    if (key) {
      this.currentBatchKeys = [key];
    }

    const scanRequestedAt = Date.now();
    const updated = this.config.onRestaurantUpdate(restaurant, (current) => ({
      ...current,
      gfMenu: [],
      menuScanStatus: 'FETCHING',
      menuScanTimestamp: scanRequestedAt,
    }));

    if (!updated) return;

    this.config.onNotifyUI();
    await this.scanSingle(restaurant);
  }
}
