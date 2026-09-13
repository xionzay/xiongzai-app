export interface PreviewConcurrencyLease {
  release(): void;
}

export interface PreviewConcurrencyLimiter {
  acquire(): PreviewConcurrencyLease | null;
}

/**
 * Single-process preview limiter. The interface is deliberately storage-free so
 * a distributed implementation can replace it without changing file services.
 */
export class InMemoryPreviewConcurrencyLimiter implements PreviewConcurrencyLimiter {
  private active = 0;

  constructor(readonly maximumConcurrent = 4) {
    if (!Number.isSafeInteger(maximumConcurrent) || maximumConcurrent < 1) {
      throw new TypeError("maximumConcurrent must be a positive safe integer");
    }
  }

  get activeCount(): number {
    return this.active;
  }

  acquire(): PreviewConcurrencyLease | null {
    if (this.active >= this.maximumConcurrent) return null;
    this.active += 1;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.active = Math.max(0, this.active - 1);
      },
    };
  }
}
