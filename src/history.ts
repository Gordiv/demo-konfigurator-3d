/** Linear undo/redo stack. Pushing after an undo drops the redo branch. */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private present: T;
  private readonly equals: (a: T, b: T) => boolean;
  private readonly limit: number;

  constructor(initial: T, equals: (a: T, b: T) => boolean = Object.is, limit = 60) {
    this.present = initial;
    this.equals = equals;
    this.limit = Math.max(1, limit);
  }

  get current(): T {
    return this.present;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Records a new state. Returns false when it equals the current one. */
  push(next: T): boolean {
    if (this.equals(next, this.present)) return false;
    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.present = next;
    this.future.length = 0;
    return true;
  }

  undo(): T | null {
    const previous = this.past.pop();
    if (previous === undefined) return null;
    this.future.push(this.present);
    this.present = previous;
    return previous;
  }

  redo(): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.present);
    this.present = next;
    return next;
  }

  /** Replaces the whole history, e.g. when a shared link is opened. */
  reset(state: T): void {
    this.past.length = 0;
    this.future.length = 0;
    this.present = state;
  }
}
