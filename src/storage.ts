import { asConfig, type Config } from './config';

export interface SavedConfig {
  id: string;
  name: string;
  createdAt: number;
  config: Config;
  /** Small JPEG data URL, may be empty. */
  thumbnail: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const STORAGE_KEY = 'konfigurator-3d:saved:v1';
export const MAX_SAVED = 12;

function safeStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function asSaved(value: unknown): SavedConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const config = asConfig(v.config);
  if (!config || typeof v.id !== 'string' || typeof v.name !== 'string' || typeof v.createdAt !== 'number') return null;
  const thumbnail = typeof v.thumbnail === 'string' && v.thumbnail.startsWith('data:image/') ? v.thumbnail : '';
  return { id: v.id, name: v.name.slice(0, 60), createdAt: v.createdAt, config, thumbnail };
}

/** Saved configurations in localStorage. Every access survives missing, full or corrupted storage. */
export class SavedStore {
  private readonly storage: StorageLike | null;
  private items: SavedConfig[];

  constructor(storage: StorageLike | null = safeStorage()) {
    this.storage = storage;
    this.items = this.read();
  }

  list(): readonly SavedConfig[] {
    return this.items;
  }

  get(id: string): SavedConfig | undefined {
    return this.items.find((item) => item.id === id);
  }

  /** Adds an entry at the front, dropping the oldest above MAX_SAVED. Returns the entry and whether it persisted. */
  add(config: Config, name: string, thumbnail = '', now = Date.now()): { item: SavedConfig; persisted: boolean } {
    const item: SavedConfig = { id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: name.slice(0, 60), createdAt: now, config, thumbnail };
    this.items = [item, ...this.items].slice(0, MAX_SAVED);
    let persisted = this.write();
    if (!persisted && thumbnail) {
      // Quota is the usual reason; retry without thumbnails.
      this.items = this.items.map((entry) => ({ ...entry, thumbnail: '' }));
      persisted = this.write();
    }
    return { item: this.items[0]!, persisted };
  }

  remove(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((item) => item.id !== id);
    if (this.items.length === before) return false;
    this.write();
    return true;
  }

  private read(): SavedConfig[] {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(asSaved).filter((item): item is SavedConfig => item !== null).slice(0, MAX_SAVED);
    } catch {
      return [];
    }
  }

  private write(): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.items));
      return true;
    } catch {
      return false;
    }
  }
}

/** Small preference values (theme, environment). */
export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(`konfigurator-3d:${key}`);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(`konfigurator-3d:${key}`, value);
  } catch {
    /* storage unavailable */
  }
}
