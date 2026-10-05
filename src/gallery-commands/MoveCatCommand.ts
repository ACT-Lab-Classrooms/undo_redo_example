import {CommandByMemento, type Memento} from "../command-history/Command.ts";
import type {CatId} from "../cats.ts";
import {GalleryState} from "./GalleryState.ts";

/**
 * A memento of the part of the gallery a move affects: where one cat was.
 *
 * @remarks
 * It stores a cat and a position, not the list of cats, so its size does not depend on how many cats are in the gallery.
 */
export class MoveCatMemento implements Memento<GalleryState> {
    /** The cat that is moved. */
    private readonly id: CatId
    /** 0-based position the cat had before the move (`-1` if it was not in the gallery). */
    private readonly index: number

    /**
     * @param id - The cat that is moved.
     * @param index - The cat's 0-based position before the move.
     */
    constructor(id: CatId, index: number) {
        this.id = id
        this.index = index
    }

    /**
     * Puts the cat back at its original position, leaving the other cats' relative order alone.
     *
     * @param state - The current gallery state.
     * @returns A state with the cat at its original position, or `state` itself if the cat is not in the gallery.
     */
    applyToState(state: GalleryState): GalleryState {
        if (!state.includes(this.id)) return state
        return state.remove(this.id).state.add(this.id, this.index)
    }
}

/**
 * Moves a cat one slot up or down. Undo comes from a {@link MoveCatMemento}, so it needs no hand-written inverse and saves only the moved cat's position.
 *
 * @remarks
 * Redo runs the move again on the gallery it first ran on.
 */
export class MoveCatCommand extends CommandByMemento<GalleryState, MoveCatMemento> {
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
     * Saves where the cat is before it moves.
     *
     * @param state - The gallery state just before the first move.
     * @returns A memento of the cat's position.
     */
    protected override createMemento(state: GalleryState): MoveCatMemento {
        return new MoveCatMemento(this.id, state.indexOf(this.id))
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
