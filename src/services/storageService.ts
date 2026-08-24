/**
 * StorageService - Hybrid persistence service using IndexedDB with fallback to localStorage.
 * Prevents QuotaExceededError crashes when saving large data structures (playlists, history, queue, metadata).
 */

const DB_NAME = "ibrastream_db";
const DB_VERSION = 1;
const STORE_NAME = "app_kv_store";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event: any) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = (event: any) => {
          resolve(event.target.result);
        };
        request.onerror = (err) => {
          console.warn("IndexedDB open failed, falling back to localStorage:", err);
          resolve(null);
        };
      } catch (e) {
        console.warn("IndexedDB initialization error:", e);
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export class StorageService {
  /**
   * Safely set item in storage (tries IndexedDB first for async storage, mirrors to localStorage with safety catch).
   */
  static async setItem<T>(key: string, value: T): Promise<void> {
    const jsonStr = typeof value === "string" ? value : JSON.stringify(value);

    // 1. Try writing to IndexedDB (unlimited quota)
    try {
      const db = await getDB();
      if (db) {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction([STORE_NAME], "readwrite");
          const store = transaction.objectStore(STORE_NAME);
          const req = store.put(jsonStr, key);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    } catch (err) {
      console.warn(`IndexedDB setItem failed for key "${key}":`, err);
    }

    // 2. Attempt localStorage sync safely with quota cleanup fallback
    try {
      localStorage.setItem(key, jsonStr);
    } catch (e: any) {
      if (e?.name === "QuotaExceededError" || e?.code === 22 || e?.code === 1014) {
        console.warn(`LocalStorage quota exceeded while saving key "${key}". Cleaning old caches...`);
        this.clearNonEssentialLocalStorage();
        try {
          localStorage.setItem(key, jsonStr);
        } catch (retryErr) {
          console.error(`LocalStorage retry failed for key "${key}". Data persisted in IndexedDB.`, retryErr);
        }
      }
    }
  }

  /**
   * Safely get item from storage (tries IndexedDB first, falls back to localStorage).
   */
  static async getItem<T>(key: string): Promise<T | null> {
    // 1. Try IndexedDB
    try {
      const db = await getDB();
      if (db) {
        const val = await new Promise<string | null>((resolve) => {
          const transaction = db.transaction([STORE_NAME], "readonly");
          const store = transaction.objectStore(STORE_NAME);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
          req.onerror = () => resolve(null);
        });

        if (val !== null) {
          try {
            return JSON.parse(val) as T;
          } catch {
            return val as unknown as T;
          }
        }
      }
    } catch (err) {
      console.warn(`IndexedDB getItem failed for key "${key}":`, err);
    }

    // 2. Fallback to localStorage synchronous lookup
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      try {
        return JSON.parse(item) as T;
      } catch {
        return item as unknown as T;
      }
    } catch (err) {
      console.warn(`localStorage getItem failed for key "${key}":`, err);
      return null;
    }
  }

  /**
   * Synchronous get item from localStorage as instant fallback.
   */
  static getItemSync<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      try {
        return JSON.parse(item) as T;
      } catch {
        return item as unknown as T;
      }
    } catch {
      return null;
    }
  }

  /**
   * Synchronous safe set item to localStorage.
   */
  static setItemSync<T>(key: string, value: T): void {
    const jsonStr = typeof value === "string" ? value : JSON.stringify(value);
    try {
      localStorage.setItem(key, jsonStr);
    } catch (e: any) {
      console.warn(`LocalStorage setItemSync failed for key "${key}":`, e);
      this.clearNonEssentialLocalStorage();
      try {
        localStorage.setItem(key, jsonStr);
      } catch (err) {
        // Suppress uncaught exception to prevent app crash popup
      }
    }

    // Also fire background async write to IndexedDB
    this.setItem(key, value).catch(() => {});
  }

  /**
   * Remove item from both IndexedDB and localStorage.
   */
  static async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch {}

    try {
      const db = await getDB();
      if (db) {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        transaction.objectStore(STORE_NAME).delete(key);
      }
    } catch {}
  }

  /**
   * Remove non-essential items from localStorage if quota is reached.
   */
  private static clearNonEssentialLocalStorage(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("ibrastream_recommendation_") || k.startsWith("ibrastream_meta_") || k.includes("cache"))) {
          keysToRemove.push(k);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    } catch {}
  }
}
