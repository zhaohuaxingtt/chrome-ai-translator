import type {
  CacheStoragePort,
  PersistedTranslation,
} from '../core/cache/translation-cache';

const DB_NAME = 'ai-translator';
const DB_VERSION = 1;
const STORE_NAME = 'translations';

/** 缓存的持久化层：IndexedDB（无 10MB 配额限制，适合长期累积译文） */
export class IndexedDbCacheStorage implements CacheStoragePort {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise === null) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    return this.dbPromise;
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();

    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = run(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(key: string): Promise<PersistedTranslation | undefined> {
    return this.withStore<PersistedTranslation | undefined>('readonly', (store) =>
      store.get(key) as IDBRequest<PersistedTranslation | undefined>,
    );
  }

  async set(key: string, value: PersistedTranslation): Promise<void> {
    await this.withStore<IDBValidKey>('readwrite', (store) => store.put(value, key));
  }

  async delete(key: string): Promise<void> {
    await this.withStore<undefined>('readwrite', (store) => store.delete(key));
  }

  async clear(): Promise<void> {
    await this.withStore<undefined>('readwrite', (store) => store.clear());
  }
}
