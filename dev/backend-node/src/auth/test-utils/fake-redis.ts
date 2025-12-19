type StoredValue = {
  value: string;
  expiresAtMs?: number;
};

export class FakeRedis {
  private readonly store = new Map<string, StoredValue>();

  private isExpired(entry: StoredValue | undefined): boolean {
    if (!entry) return true;
    if (entry.expiresAtMs === undefined) return false;
    return Date.now() >= entry.expiresAtMs;
  }

  private getEntry(key: string): StoredValue | undefined {
    const entry = this.store.get(key);
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.getEntry(key);
    return entry ? entry.value : null;
  }

  // Minimal ioredis-compatible set() for our tests: supports EX <seconds> and NX.
  async set(key: string, value: string, ...args: any[]): Promise<'OK' | null> {
    let exSeconds: number | undefined;
    let nx = false;

    for (let i = 0; i < args.length; i += 1) {
      const token = String(args[i]).toUpperCase();
      if (token === 'EX') {
        const raw = args[i + 1];
        exSeconds = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
        i += 1;
        continue;
      }
      if (token === 'NX') {
        nx = true;
        continue;
      }
    }

    if (nx && this.getEntry(key)) {
      return null;
    }

    const entry: StoredValue = { value };
    if (exSeconds !== undefined && !Number.isNaN(exSeconds)) {
      entry.expiresAtMs = Date.now() + Math.max(0, exSeconds) * 1000;
    }
    this.store.set(key, entry);
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    const existing = this.getEntry(key);
    const current = existing ? parseInt(existing.value, 10) : 0;
    const next = (Number.isNaN(current) ? 0 : current) + 1;
    const expiresAtMs = existing?.expiresAtMs;
    this.store.set(key, { value: String(next), expiresAtMs });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const existing = this.getEntry(key);
    if (!existing) return 0;
    existing.expiresAtMs = Date.now() + Math.max(0, seconds) * 1000;
    this.store.set(key, existing);
    return 1;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

