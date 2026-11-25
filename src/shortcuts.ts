export type ShortcutAction =
  | { type: 'shape'; index: number }
  | { type: 'color'; step: 1 | -1 }
  | { type: 'finish'; step: 1 | -1 }
  | { type: 'size'; step: 1 | -1 }
  | { type: 'environment'; step: 1 | -1 }
  | { type: 'view'; view: CameraView }
  | { type: 'toggle'; what: 'presentation' | 'dimensions' | 'theme' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'save' }
  | { type: 'open'; what: 'saved' | 'export' | 'help' };

export type CameraView = 'hero' | 'front' | 'top' | 'detail';

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Keys shown in the help overlay, in display order. */
export const SHORTCUT_HELP: readonly { keys: string[]; label: string }[] = [
  { keys: ['1', '–', '6'], label: 'Wybór modelu' },
  { keys: ['C'], label: 'Następny kolor (Shift: poprzedni)' },
  { keys: ['M'], label: 'Następne wykończenie' },
  { keys: ['R'], label: 'Zmiana rozmiaru' },
  { keys: ['O'], label: 'Następne otoczenie' },
  { keys: ['H'], label: 'Widok 3/4' },
  { keys: ['F'], label: 'Widok z przodu' },
  { keys: ['G'], label: 'Widok z góry' },
  { keys: ['Z'], label: 'Zbliżenie na detal' },
  { keys: ['P'], label: 'Tryb prezentacji (obrót)' },
  { keys: ['W'], label: 'Wymiary i moduły' },
  { keys: ['T'], label: 'Jasny / ciemny motyw' },
  { keys: ['Ctrl', 'Z'], label: 'Cofnij' },
  { keys: ['Ctrl', 'Y'], label: 'Ponów (także Ctrl+Shift+Z)' },
  { keys: ['Ctrl', 'S'], label: 'Zapisz konfigurację' },
  { keys: ['S'], label: 'Zapisane i porównanie' },
  { keys: ['E'], label: 'Eksport PNG' },
  { keys: ['?'], label: 'Ta lista skrótów' },
];

/** Maps a key event to an action, or null. Uses `key`, so it follows the active keyboard layout. */
export function resolveShortcut(e: KeyLike): ShortcutAction | null {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey) return null;
  if (mod) {
    if (key === 'z') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
    if (key === 'y') return { type: 'redo' };
    if (key === 's') return { type: 'save' };
    return null;
  }
  if (key === '?') return { type: 'open', what: 'help' };
  if (/^[1-6]$/.test(key)) return { type: 'shape', index: Number(key) - 1 };
  const step = e.shiftKey ? -1 : 1;
  switch (key) {
    case 'c':
      return { type: 'color', step };
    case 'm':
      return { type: 'finish', step };
    case 'r':
      return { type: 'size', step };
    case 'o':
      return { type: 'environment', step };
    case 'h':
      return { type: 'view', view: 'hero' };
    case 'f':
      return { type: 'view', view: 'front' };
    case 'g':
      return { type: 'view', view: 'top' };
    case 'z':
      return { type: 'view', view: 'detail' };
    case 'p':
      return { type: 'toggle', what: 'presentation' };
    case 'w':
      return { type: 'toggle', what: 'dimensions' };
    case 't':
      return { type: 'toggle', what: 'theme' };
    case 's':
      return { type: 'open', what: 'saved' };
    case 'e':
      return { type: 'open', what: 'export' };
    default:
      return null;
  }
}

/** Steps through a list with wrap-around. */
export function cycle<T>(list: readonly T[], current: T, step: number): T {
  const index = list.indexOf(current);
  const next = (((index < 0 ? 0 : index) + step) % list.length + list.length) % list.length;
  return list[next]!;
}
