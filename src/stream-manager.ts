/**
 * StreamManager — shared, ref-counted MediaStream registry.
 *
 * Both the PREVIEW and PROGRAM Composer instances may have the same
 * screen / camera source active at the same time. Without sharing,
 * each Composer opens its own getUserMedia stream → double the OS
 * capture + decode cost.
 *
 * Usage:
 *   const stream = await streamManager.acquire(key, factory);
 *   // ... use stream ...
 *   streamManager.release(key); // decrements ref; stops tracks when count → 0
 */

interface StreamEntry {
  stream: MediaStream;
  count: number;
}

class StreamManager {
  private registry: Record<string, StreamEntry> = {};

  /** Return the live stream for a key, or undefined if not yet acquired. */
  get(key: string): MediaStream | undefined {
    return this.registry[key]?.stream;
  }

  /**
   * Acquire a stream for the given key.
   * If a stream is already registered, its ref-count is incremented and
   * the existing stream is returned immediately without calling factory.
   * Otherwise factory() is called, the result is stored, and returned.
   */
  async acquire(key: string, factory: () => Promise<MediaStream>): Promise<MediaStream> {
    if (this.registry[key]) {
      this.registry[key].count++;
      return this.registry[key].stream;
    }
    const stream = await factory();
    this.registry[key] = { stream, count: 1 };
    return stream;
  }

  /**
   * Decrement the ref-count for the given key.
   * When the count reaches 0, all tracks are stopped and the entry is deleted.
   */
  release(key: string): void {
    const entry = this.registry[key];
    if (!entry) return;
    entry.count--;
    if (entry.count <= 0) {
      entry.stream.getTracks().forEach(t => t.stop());
      delete this.registry[key];
    }
  }
}

export const streamManager = new StreamManager();
