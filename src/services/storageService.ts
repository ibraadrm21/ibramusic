const DB_NAME = "ibrastream_db";
const STORE_NAME = "app_kv_store";

let dbPromise: Promise<IDBDatabase | null> | null = null;
const writes = new Map<string, Promise<void>>();

function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  dbPromise ??= new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function writeToDatabase(key: string, change: (store: IDBObjectStore) => void): Promise<void> {
  const operation = (writes.get(key) ?? Promise.resolve()).then(async () => {
    const db = await getDB();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      change(transaction.objectStore(STORE_NAME));
    });
  }).catch(() => {});
  writes.set(key, operation);
  void operation.then(() => { if (writes.get(key) === operation) writes.delete(key); });
  return operation;
}

function parse<T>(value: string): T {
  try { return JSON.parse(value) as T; } catch { return value as T; }
}

const disposableCache = [
  "ibrastream_lyrics_",
  "ibrastream_recommendation_",
  "ibrastream_home_recommendations",
  "ibrastream_similar_artists_",
];

export class StorageService {
  static async setItem<T>(key: string, value: T): Promise<void> {
    const encoded = typeof value === "string" ? value : JSON.stringify(value);
    try {
      localStorage.setItem(key, encoded);
    } catch {
      this.clearNonEssentialLocalStorage();
      try { localStorage.setItem(key, encoded); } catch { /* IndexedDB can still persist this value. */ }
    }
    await writeToDatabase(key, store => { store.put(encoded, key); });
  }

  static setItemSync<T>(key: string, value: T): void {
    void this.setItem(key, value);
  }

  static async getItem<T>(key: string): Promise<T | null> {
    await writes.get(key);
    try {
      const db = await getDB();
      if (db) {
        const value = await new Promise<string | undefined>((resolve, reject) => {
          const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (value !== undefined) return parse<T>(value);
      }
    } catch {
      // Use the synchronous mirror when IndexedDB is unavailable.
    }
    return this.getItemSync<T>(key);
  }

  static getItemSync<T>(key: string): T | null {
    try {
      const value = localStorage.getItem(key);
      return value === null ? null : parse<T>(value);
    } catch {
      return null;
    }
  }

  static async removeItem(key: string): Promise<void> {
    try { localStorage.removeItem(key); } catch { /* Continue removing the IndexedDB copy. */ }
    await writeToDatabase(key, store => { store.delete(key); });
  }

  static clearNonEssentialLocalStorage(): void {
    try {
      const keys = Object.keys(localStorage).filter(key => disposableCache.some(prefix => key.startsWith(prefix)));
      keys.forEach(key => localStorage.removeItem(key));
    } catch {
      // Storage access can be disabled by the browser.
    }
  }
}
