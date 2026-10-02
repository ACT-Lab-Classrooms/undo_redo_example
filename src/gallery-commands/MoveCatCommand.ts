import {GalleryCommandEntry} from "./GalleryCommandEntry.ts";
import type {CatId} from "../cats.ts";
import {GalleryState} from "./GalleryState.ts";

/** Moves a cat one slot up or down. Defines only {@link GalleryCommandEntry.action}, so it relies on the default snapshot undo/redo. */
export class MoveCatCommand extends GalleryCommandEntry {
    /** The cat to move. */
    private readonly id: CatId
    /** `-1` moves toward the start of the gallery, `1` toward the end. */
    private readonly direction: -1 | 1
    /** 0-based position the cat moved from; known once the action has run. */
    private from: number | undefined
    /** 0-based position the cat moved to; known once the action has run. */
    private to: number | undefined

    /**
     * @param id - The cat to move.
     * @param direction - `-1` to move up (toward the start), `1` to move down.
     */
    constructor(id: CatId, direction: -1 | 1) {
        super()
        this.id = id
        this.direction = direction
    }

    /**
     * Swaps the cat with its neighbor in the move direction.
     *
     * @param state - The current gallery state.
     * @returns A new state with the cat moved, or `state` itself if the cat is absent or already at the edge.
     */
    protected override action(state: GalleryState): GalleryState {
        const from = state.indexOf(this.id)
        const next = state.move(this.id, this.direction)
        if (next !== state) {
            this.from = from
            this.to = from + this.direction
        }
        return next
    }

    /** @returns `"Moved <cat> from position # to #"` once the move has run (1-based positions), or `"Move <cat> up|down"` before it has. */
    override toString(): string {
        if (this.from === undefined || this.to === undefined) {
            return `Move ${this.id} ${this.direction < 0 ? 'up' : 'down'}`
        }
        return `Moved ${this.id} from position ${this.from + 1} to ${this.to + 1}`
    }
}