import type { CatId } from '../cats.ts'

/**
 * The application state that undo/redo operates on: the ordered list of cats currently in the gallery.
 *
 * @remarks
 * Immutable by design. React (and the undo/redo snapshots) detect change by reference, so every operation returns a new `GalleryState` and never modifies `this`. When an operation has nothing to do it returns `this`, which lets React skip the re-render.
 * The class is iterable: `[...gallery]` and `for (const id of gallery)` yield the cats in display order.
 */
export class GalleryState {
  /** A gallery with no cats. The starting point from which every other state is built with {@link GalleryState.add}. */
  static readonly empty = new GalleryState([])

  /** The cats in display order. Never exposed or mutated after construction. */
  private readonly ids: readonly CatId[]

  /** @param ids - The cats in display order. The array must not be modified afterwards. */
  private constructor(ids: readonly CatId[]) {
    this.ids = ids
  }

  /** The number of cats in the gallery. */
  get length(): number {
    return this.ids.length
  }

  /**
   * Looks up the cat at a position.
   *
   * @remarks
   * Unlike `Array.prototype.at`, negative indexes do not count from the end.
   *
   * @param index - 0-based position.
   * @returns The cat at `index`, or `undefined` if the position is outside the gallery.
   */
  at(index: number): CatId | undefined {
    return index >= 0 ? this.ids[index] : undefined
  }

  /**
   * Tests whether a cat is in the gallery.
   *
   * @param id - The cat to look for.
   * @returns `true` if the cat is present.
   */
  includes(id: CatId): boolean {
    return this.ids.includes(id)
  }

  /**
   * Finds a cat's position.
   *
   * @param id - The cat to look for.
   * @returns The 0-based position of the cat, or `-1` if it is not in the gallery.
   */
  indexOf(id: CatId): number {
    return this.ids.indexOf(id)
  }


  /**
   * Finds a neighbor cat.
   * @param id - The cat to find a neighbor of.
   * @returns The cat to the right if available, to the left if there is no cat to the right, the first cat in the gallery if this cat isn't in the gallery, and None if the gallery is empty.
   */
  neighborOf(id: CatId): CatId | null {
    const i = this.indexOf(id);
    return this.at(i + 1) ?? this.at(i - 1) ?? null
  }

  /**
   * Finds the cat before or after another cat, wrapping around at the ends of the list.
   *
   * @param id - The cat to start from.
   * @param direction - `-1` for the previous cat, `1` for the next cat.
   * @returns The previous or next cat, wrapping from the first cat to the last (or the last to the first), or `null` if there is no other cat to go to (the gallery has fewer than two cats, or `id` is not in it).
   */
  cycleFrom(id: CatId, direction: -1 | 1): CatId | null {
    const i = this.indexOf(id)
    if (i < 0 || this.length < 2) return null
    return this.at((i + direction + this.length) % this.length) ?? null
  }

  /** @returns An iterator over the cats in display order. */
  [Symbol.iterator](): Iterator<CatId> {
    return this.ids[Symbol.iterator]()
  }

  /**
   * Adds a cat at a position.
   *
   * @param id - The cat to add.
   * @param index - 0-based insertion position. Defaults to the end of the list; a value past the end is clamped to the end.
   * @returns A new state containing the cat at that position, or `this` if the cat is already in the gallery.
   */
  add(id: CatId, index: number = this.ids.length): GalleryState {
    if (this.includes(id)) return this
    const next = [...this.ids]
    next.splice(index, 0, id)
    return new GalleryState(next)
  }

  /**
   * Removes a cat and reports where it was.
   *
   * @param id - The cat to remove.
   * @returns `state`: a new state without the cat (or `this` if it was not present), and `index`: the 0-based position the cat was removed from (`-1` if it was not present).
   */
  remove(id: CatId): { state: GalleryState; index: number } {
    const index = this.ids.indexOf(id)
    if (index < 0) return { state: this, index }
    return { state: new GalleryState(this.ids.filter((c) => c !== id)), index }
  }

  /**
   * Moves a cat one position toward the start or the end by swapping it with its neighbor.
   *
   * @param id - The cat to move.
   * @param direction - `-1` to move toward the start (up), `1` toward the end (down).
   * @returns A new state with the cat moved, or `this` if the cat is absent or already at that edge.
   */
  move(id: CatId, direction: -1 | 1): GalleryState {
    const from = this.ids.indexOf(id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= this.ids.length) return this
    const next = [...this.ids]
    next.splice(from, 1)
    next.splice(to, 0, id)
    return new GalleryState(next)
  }

  /**
   * Compares two states by content.
   *
   * @param other - The state to compare with.
   * @returns `true` if both contain the same cats in the same order.
   */
  equals(other: GalleryState): boolean {
    return this.ids.length === other.ids.length && this.ids.every((id, i) => id === other.ids[i])
  }
}
