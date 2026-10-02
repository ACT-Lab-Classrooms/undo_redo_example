import {GalleryState} from "./GalleryState.ts";

/**
 * Base class for every undoable user action.
 *
 * @remarks
 * Subclasses must implement {@link GalleryCommandEntry.action}. By default {@link GalleryCommandEntry.do} and {@link GalleryCommandEntry.undo} provide snapshot undo/redo around it; subclasses may override them (and the other hooks) to supply a programmer-defined inverse instead.
 */
export abstract class GalleryCommandEntry {
    /** State captured just before the first run of {@link GalleryCommandEntry.action}. */
    private before: GalleryState | undefined
    /** State produced by the first run of {@link GalleryCommandEntry.action}. */
    private after: GalleryState | undefined

    /**
     * The change this entry makes. Subclasses must define it.
     *
     * @param state - The gallery state to apply the change to.
     * @returns The new gallery state. Must not mutate `state`.
     */
    protected abstract action(state: GalleryState): GalleryState

    /**
     * Performs (or redoes) the action.
     *
     * @remarks
     * Default snapshot behavior: on the first execution it collects the prior state and logs the after-state.
     * On redo, it replays the cached after-state instead of recomputing it.
     *
     * @param state - The current gallery state.
     * @returns The gallery state after the action.
     */
    do(state: GalleryState): GalleryState {
        if (this.after === undefined) {
            this.before = state
            this.after = this.action(state)
        }
        return this.after
    }

    /**
     * Reverses the action.
     *
     * @remarks
     * Default snapshot behavior: restores the state recorded before the action ran.
     *
     * @param state - The current gallery state, which is the state this entry produced (undo is strictly last-in-first-out).
     * @returns The restored gallery state. If the entry never ran, `state` is returned unchanged.
     */
    undo(state: GalleryState): GalleryState {
        return this.before ?? state
    }

    /**
     * Reports whether {@link GalleryCommandEntry.do} can meaningfully be applied to a state. Redo skips entries for which this is false.
     *
     * @param _state - The gallery state the entry would be applied to.
     * @returns `true` if the entry still applies. The default is always `true`.
     */
    canDo(_state: GalleryState): boolean {
        return true
    }

    /**
     * Whether this entry can still be redone once the gallery state has changed (for example after the user performs a new action).
     *
     * @remarks
     * The default snapshot behavior replays a cached after-state, which is only correct when redo starts from exactly the state the entry originally ran against.
     * Subclasses whose redo does not depend on the current state (they re-apply a described action rather than a cached state) can override this to return `true`.
     *
     * @param currentState - The gallery state a redo would start from.
     * @returns `true` if the entry can still be redone. By default, `true` only if `currentState` matches the state recorded before the entry first ran.
     */
    survivesStateChange(currentState: GalleryState): boolean {
        return this.before !== undefined && currentState.equals(this.before)
    }

    /**
     * Describes what this entry did, in enough detail to be clear in the user interface (tooltips and the History panel).
     *
     * @returns A past-tense, human-readable description such as `"Added bruce at position 2"`. Positions are 1-based.
     */
    abstract toString(): string
}

/**
 * Base class for commands that cache no state: {@link GalleryCommandEntry.do} simply calls {@link GalleryCommandEntry.action} every time, so the command must describe a change that can be applied to whatever the state is.
 *
 * @remarks
 * Subclasses still define {@link GalleryCommandEntry.action} and must override {@link GalleryCommandEntry.undo} with a hand-written inverse, since there is no recorded before-state to restore.
 */
export abstract class CommandWithoutCachedState extends GalleryCommandEntry {
    /**
     * Performs (or redoes) the action by running it directly, without recording before/after snapshots.
     *
     * @param state - The current gallery state.
     * @returns The gallery state after the action.
     */
    override do(state: GalleryState): GalleryState {
        return this.action(state);
    }

    /**
     * @param _currentState - The gallery state a redo would start from (ignored).
     * @returns Always `true` because these actions do not depend on a cached state.
     * */
    override survivesStateChange(_currentState: GalleryState): boolean {
        return true;
    }
}