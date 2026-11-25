import { describe, expect, it } from 'vitest';
import { MAX_SAVED, STORAGE_KEY, SavedStore } from '../src/storage';
import { DEFAULT_CONFIG } from '../src/config';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

class FullStorage extends MemoryStorage {
  override setItem(key: string, value: string) {
    if (value.includes('data:image')) throw new DOMException('full', 'QuotaExceededError');
    super.setItem(key, value);
  }
}

const throwing = {
  getItem(): string | null {
    throw new Error('denied');
  },
  setItem(): void {
    throw new Error('denied');
  },
};

describe('SavedStore', () => {
  it('saves, lists newest first and reloads from storage', () => {
    const storage = new MemoryStorage();
    const store = new SavedStore(storage);
    store.add(DEFAULT_CONFIG, 'Pierwsza', '', 1000);
    store.add({ ...DEFAULT_CONFIG, shape: 'bowl' }, 'Druga', '', 2000);
    expect(store.list().map((i) => i.name)).toEqual(['Druga', 'Pierwsza']);
    const again = new SavedStore(storage);
    expect(again.list().map((i) => i.config.shape)).toEqual(['bowl', 'vase']);
  });

  it(`keeps at most ${MAX_SAVED} entries`, () => {
    const store = new SavedStore(new MemoryStorage());
    for (let i = 0; i < MAX_SAVED + 5; i++) store.add(DEFAULT_CONFIG, `#${i}`, '', i);
    expect(store.list()).toHaveLength(MAX_SAVED);
    expect(store.list()[0]!.name).toBe(`#${MAX_SAVED + 4}`);
  });

  it('removes entries', () => {
    const store = new SavedStore(new MemoryStorage());
    const { item } = store.add(DEFAULT_CONFIG, 'x');
    expect(store.remove(item.id)).toBe(true);
    expect(store.remove(item.id)).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('survives storage that throws', () => {
    const store = new SavedStore(throwing);
    expect(store.list()).toEqual([]);
    const result = store.add(DEFAULT_CONFIG, 'x');
    expect(result.persisted).toBe(false);
    expect(store.list()).toHaveLength(1);
  });

  it('works without any storage', () => {
    const store = new SavedStore(null);
    expect(store.add(DEFAULT_CONFIG, 'x').persisted).toBe(false);
  });

  it('drops thumbnails when the quota is exceeded', () => {
    const storage = new FullStorage();
    const store = new SavedStore(storage);
    const { persisted, item } = store.add(DEFAULT_CONFIG, 'x', 'data:image/jpeg;base64,AAAA');
    expect(persisted).toBe(true);
    expect(item.thumbnail).toBe('');
  });

  it('ignores corrupted or tampered data', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(new SavedStore(storage).list()).toEqual([]);
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: 'a', name: 'ok', createdAt: 1, config: DEFAULT_CONFIG, thumbnail: 'javascript:alert(1)' },
        { id: 'b', name: 'bad', createdAt: 1, config: { ...DEFAULT_CONFIG, shape: 'cup' } },
        { id: 3, name: 'bad id', createdAt: 1, config: DEFAULT_CONFIG },
        'nope',
      ]),
    );
    const list = new SavedStore(storage).list();
    expect(list.map((i) => i.id)).toEqual(['a']);
    expect(list[0]!.thumbnail).toBe('');
  });
});
