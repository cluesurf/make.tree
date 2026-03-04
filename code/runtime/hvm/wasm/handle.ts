// handle.ts - Handle table for bridging JS objects into HVM.
//
// HVM sees native objects as opaque NUM terms (the handle ID).
// The handle table maps IDs back to the real JS objects and
// prevents garbage collection while HVM holds a reference.

export class HandleTable {
  private nextId = 1
  private objects = new Map<number, unknown>()

  register(obj: unknown): number {
    const id = this.nextId
    this.nextId += 1
    this.objects.set(id, obj)
    return id
  }

  get(id: number): unknown {
    return this.objects.get(id)
  }

  release(id: number): void {
    this.objects.delete(id)
  }

  has(id: number): boolean {
    return this.objects.has(id)
  }

  clear(): void {
    this.objects.clear()
    this.nextId = 1
  }

  get size(): number {
    return this.objects.size
  }
}
