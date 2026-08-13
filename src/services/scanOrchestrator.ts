import { Restaurant } from '../types/restaurant';
import { scanRestaurantMenu, scanRestaurantMenuWithBrowser } from './menuScanner';
import { getMenuScanTargets, CONCURRENT_SCAN_LIMIT } from '../context/restaurantState';
import { getRestaurantIdentityKey } from '../util/restaurantUtils';
import { logger } from '../util/logger';

export interface ScanOrchestratorConfig {
  mapsApiKey: string;
  htmlProxyBaseUrl?: string;
  onRestaurantUpdate: (
    target: Restaurant,
    updater: (current: Restaurant) => Restaurant
  ) => boolean;
  onNotifyUI: () => void;
  getIdentityKey?: (restaurant: Restaurant) => string | null;
}

/**
 * Orchestrates the lifecycle of restaurant menu scans, including batching,
 * status transitions, and concurrency control.
 */
export class ScanOrchestrator {
  private activeScans = new Set<string>();
  private scanControllers = new Map<string, AbortController>();
  private currentBatchKeys: string[] = [];
  private scanQueue: Restaurant[] = [];
  private isProcessing = false;
  private isDestroyed = false;

  constructor(private config: ScanOrchestratorConfig) {}

  /**
   * Stops all processing and prevents future scans.
   */
  destroy() {
    this.isDestroyed = true;
    this.scanQueue = [];
    this.currentBatchKeys = [];
  }

  /**
   * Updates the orchestrator configuration (callbacks and keys) without
   * interrupting the current scan queue or worker pool.
   */
  setConfig(config: ScanOrchestratorConfig) {
    this.config = config;
  }

  private trackBatchKey(restaurant: Restaurant) {
    const getKey = this.config.getIdentityKey || getRestaurantIdentityKey;
    const key = getKey(restaurant);
    if (key && !this.currentBatchKeys.includes(key)) {
      this.currentBatchKeys.push(key);
    }
  }

  private clearBatchTrackingIfIdle() {
    if (this.isDestroyed) return;
    if (this.scanQueue.length > 0 || this.activeScans.size > 0 || this.isProcessing) return;

    this.currentBatchKeys = [];
  }

  /**
   * Clears the pending scan queue and stops tracking for the current batch.
   * This should be called when the user starts a fresh search or navigates away.
   */
  flushQueue() {
    for (const controller of this.scanControllers.values()) controller.abort();
    this.scanControllers.clear();
    this.scanQueue = [];
    this.currentBatchKeys = [];
    this.activeScans.clear();
    this.config.onNotifyUI();
  }

  /**
   * Returns the keys of restaurants currently being tracked in the active batch.
   */
  getBatchKeys(): string[] {
    return [...this.currentBatchKeys];
  }

  /**
   * Orchestrates scans for a list of restaurants based on TTL and priority.
   */
  async scanBatch(restaurants: Restaurant[]): Promise<void> {
    const targets = getMenuScanTargets(restaurants);
    if (targets.length === 0) return;

    await this.enqueueAndStart(targets);
  }

  /**
   * Retries all restaurants that currently have a FAILED scan status.
   */
  async retryFailed(restaurants: Restaurant[]): Promise<void> {
    const targets = restaurants.filter((r) => r.menuScanStatus === 'FAILED');
    if (targets.length === 0) return;

    await this.enqueueAndStart(targets);
  }

  /**
   * Forces a rescan for a specific restaurant, clearing previous data.
   */
  async requestRescan(restaurant: Restaurant): Promise<void> {
    this.trackBatchKey(restaurant);

    const scanRequestedAt = Date.now();
    const updated = this.config.onRestaurantUpdate(restaurant, (current) => ({
      ...current,
      gfMenu: [],
      menuScanStatus: 'FETCHING',
      menuScanTimestamp: scanRequestedAt,
    }));

    if (!updated) return;

    this.config.onNotifyUI();
    await this.enqueueAndStart([restaurant]);
  }

  async requestInteractiveMenuRender(restaurant: Restaurant): Promise<void> {
    const id = restaurant.placeId;
    if (!id || this.activeScans.has(id) || this.isDestroyed) return;

    this.trackBatchKey(restaurant);
    this.activeScans.add(id);
    const controller = new AbortController();
    this.scanControllers.set(id, controller);
    const scanStartedAt = Date.now();

    try {
      const started = this.config.onRestaurantUpdate(restaurant, (current) => ({
        ...current,
        gfMenu: [],
        rawMenuText: null,
        menuScanStatus: 'FETCHING',
        menuScanTimestamp: scanStartedAt,
      }));
      if (!started) return;
      this.config.onNotifyUI();

      const result = await scanRestaurantMenuWithBrowser({
        restaurant,
        scanStartedAt,
        htmlProxyBaseUrl: this.config.htmlProxyBaseUrl,
        signal: controller.signal,
      });
      if (this.isDestroyed || !result) return;

      const applied = this.config.onRestaurantUpdate(restaurant, (current) => {
        if (current.menuScanStatus !== 'FETCHING' || current.menuScanTimestamp !== scanStartedAt) {
          return current;
        }
        return { ...current, ...result };
      });
      if (applied) this.config.onNotifyUI();
    } catch (error) {
      if (this.isDestroyed) return;
      if (controller.signal.aborted) return;
      logger.error('Interactive menu render failed for ' + restaurant.name, error);
      this.config.onRestaurantUpdate(restaurant, (current) => ({
        ...current,
        menuScanStatus: 'NO_MENU_CONTENT',
        menuScanTimestamp: scanStartedAt,
      }));
      this.config.onNotifyUI();
    } finally {
      this.activeScans.delete(id);
      if (this.scanControllers.get(id) === controller) this.scanControllers.delete(id);
      this.clearBatchTrackingIfIdle();
      this.config.onNotifyUI();
    }
  }

  /**
   * Internal helper to add items to the shared queue and ensure workers are running.
   */
  private async enqueueAndStart(targets: Restaurant[]): Promise<void> {
    if (this.isDestroyed) return;
    
    // Add new targets to queue, avoiding duplicates already in queue or processing
    for (const target of targets) {
      const id = target.placeId;
      const isAlreadyInQueue = this.scanQueue.some((q) => q.placeId === id);
      if (id && !this.activeScans.has(id) && !isAlreadyInQueue) {
        this.scanQueue.push(target);
      }

      this.trackBatchKey(target);
    }

    if (this.scanQueue.length > 0 && !this.isProcessing) {
      this.startWorkerPool();
    }
    
    this.config.onNotifyUI();
  }

  /**
   * Starts a fixed number of workers to process the shared queue.
   */
  private async startWorkerPool(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const workers = Array(CONCURRENT_SCAN_LIMIT)
      .fill(null)
      .map(async () => {
        while (this.scanQueue.length > 0 && !this.isDestroyed) {
          const restaurant = this.scanQueue.shift();
          if (restaurant) {
            await this.scanSingle(restaurant);
            if (this.isDestroyed) break;
            // Stagger to avoid burst
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }
      });

    try {
      await Promise.all(workers);
    } catch (error) {
      logger.error('Worker pool encountered an unexpected error', error);
    } finally {
      this.isProcessing = false;
      if (this.isDestroyed) return;

      // Clear batch tracking when the queue is finally empty and workers are done
      this.clearBatchTrackingIfIdle();
      this.config.onNotifyUI();
    }
  }

  /**
   * Performs the actual scan logic for a single restaurant with full error safety.
   */
  private async scanSingle(restaurant: Restaurant): Promise<void> {
    const id = restaurant.placeId;
    if (!id || this.activeScans.has(id) || !this.config.mapsApiKey || this.isDestroyed) return;

    this.activeScans.add(id);
    const controller = new AbortController();
    this.scanControllers.set(id, controller);
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
        htmlProxyBaseUrl: this.config.htmlProxyBaseUrl,
        signal: controller.signal,
      });

      if (this.isDestroyed) return;

      // 3. Apply the results
      if (result) {
        const applied = this.config.onRestaurantUpdate(restaurant, (current) => {
          // Guard against stale results from concurrent manual rescans
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
        }
      }
    } catch (error) {
      if (this.isDestroyed) return;
      if (controller.signal.aborted) return;

      // CRITICAL FIX: Ensure restaurant doesn't stay in 'FETCHING' state if scan crashes
      logger.error(`Scan failed for ${restaurant.name}`, error);
      this.config.onRestaurantUpdate(restaurant, (current) => ({
        ...current,
        menuScanStatus: 'FAILED',
        menuScanTimestamp: scanStartedAt,
      }));
      this.config.onNotifyUI();
    } finally {
      this.activeScans.delete(id);
      if (this.scanControllers.get(id) === controller) this.scanControllers.delete(id);
    }
  }
}
