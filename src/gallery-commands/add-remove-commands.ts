import {Command} from "../command-history/Command.ts";
import type {CatId} from "../cats.ts";
import {GalleryState} from "./GalleryState.ts";

/**
 * Adds a cat at a position, with a handwritten inverse.
 *
 * @remarks
 * Undo removes the cat; redo re-inserts it at the same index.
 */
export class AddCatCommand extends Command<GalleryState> {
    /** The cat to add. */
    private readonly id: CatId
    /** The position the cat is inserted at: given at construction, or the end of the gallery on the first run if none was given. */
    private index: number | undefined

    /**
     * @param id - The cat to add.
     * @param index - The position to insert the cat at. Defaults to the end of the gallery.
     */
    constructor(id: CatId, index?: number) {
        super()
        this.id = id
        this.index = index
    }

    /**
     * Inserts the cat at the captured index.
     *
     * @param state - The current gallery state.
     * @returns A new state containing the cat.
     */
    protected override action(state: GalleryState): GalleryState {
        this.index ??= state.length
        return state.add(this.id, this.index)
    }

    /**
     * The inverse of {@link Command.do}: removes the cat.
     *
     * @param state - The current gallery state.
     * @returns The gallery state without the cat.
     */
    override undo(state: GalleryState): GalleryState {
        return state.remove(this.id).state
    }

    /** @returns `"Added <cat> at position #"` (1-based) once the command has run, or `"Add <cat>"` before it has. */
    override toString(): string {
        return this.index === undefined ? `Add ${this.id}` : `Added ${this.id} at position ${this.index + 1}`
    }
}

/**
 * Removes a cat, remembering where it was, with a handwritten inverse.
 *
 * @remarks
 * Undo re-inserts the cat at the remembered index; redo removes it again.
 */
export class RemoveCatCommand extends Command<GalleryState> {
    /** The cat to remove. */
    private readonly id: CatId
    /** The position the cat is restored to on undo; recorded the first time the command runs. */
    private index: number | undefined

    /** @param id - The cat to remove. */
    constructor(id: CatId) {
        super()
        this.id = id
    }

    /**
     * Removes the cat, remembering the position it was removed from the first time.
     *
     * @param state - The current gallery state.
     * @returns A new state without the cat.
     */
    protected override action(state: GalleryState): GalleryState {
        const removed = state.remove(this.id)
        this.index ??= removed.index
        return removed.state
    }

    /**
     * The inverse of {@link Command.do}: re-inserts the cat at the remembered index.
     *
     * @param state - The current gallery state.
     * @returns The gallery state with the cat restored.
     */
    override undo(state: GalleryState): GalleryState {
        return state.add(this.id, this.index)
    }

    /** @returns `"Removed <cat> from position #"` (1-based) once the command has run, or `"Remove <cat>"` before it has. */
    override toString(): string {
        return this.index === undefined ? `Remove ${this.id}` : `Removed ${this.id} from position ${this.index + 1}`
    }
}