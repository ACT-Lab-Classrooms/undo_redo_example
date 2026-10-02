/**
 * Undo/redo core. Pure TypeScript, no UI code, so it can be read on its own.
 *
 * @remarks
 * The state itself is the immutable {@link GalleryState} class, which owns the primitive operations (add at a position, remove and report the position, move up/down); commands only decide which operation to run and what to remember for the inverse.
 * Every user action is a subclass of the abstract {@link GalleryCommandEntry}, and the history stack only ever deals with that one type. Each subclass must define {@link GalleryCommandEntry.action}, the change itself.
 * From there, there are two ways to get undo/redo:
 *
 * 1. **Snapshot behavior (the default).** Define only `action`. The base class records the state before and the state after the first time it runs. Undo restores `before`, redo restores `after`. There is no inverse logic to get wrong, but memory grows with the size of the state.
 *    See {@link MoveCatCommand}.
 *
 * 2. **Custom behavior.** Also override {@link GalleryCommandEntry.undo} with a handwritten inverse, and extend {@link CommandWithoutCachedState} so that {@link GalleryCommandEntry.do} just runs the action (or override `do` yourself).
 *    Everything needed to invert the action (which cat, which position) is captured by the command.
 *    This is cheap in memory, but every action needs its own inverse. See {@link AddCatCommand} and {@link RemoveCatCommand}.
 *
 * Mixing them is safe because undo/redo is strictly LIFO: when an entry is undone, the state is exactly what it was right after that entry ran, so both a position-based inverse and a stored snapshot are valid.
 *
 * What happens to the redo stack?
 *
 * - When the user does something *new*, snapshot entries are discarded unless the current state still equals the state they were recorded against: replaying a cached after-state is only correct from that exact starting point. This is the default of {@link GalleryCommandEntry.survivesStateChange}.
 * - Custom commands override {@link GalleryCommandEntry.survivesStateChange} to always survive: they describe an action ("add kaliope at slot 1"), not a state, so they can still be applied to the new state.
 * - Redo runs the most recent entry that can be applied to the current state (see {@link History.nextRedo}, based on {@link GalleryCommandEntry.canDo}), which is not necessarily the top of the stack. Only that entry is removed from the redo stack.
 * - Entries that redo can never reach are **stale** and get pruned (see below). An entry that cannot be applied *right now* is not necessarily stale: "Removed kaliope" cannot apply while kaliope is absent, but it can once the "Added kaliope" above it has been redone.
 *   Staleness is therefore found by simulating repeated redos from the current state; whatever the simulation never applies is stale.
 *
 * Pruning is treated as an expensive background task. Redo never waits for it (it just skips what it cannot apply), so the gallery and the Undo/Redo buttons update immediately.
 * The simulation advances one redo step per call of {@link History.pruneStep}, which the UI makes inside a React transition, so the redo stack in the history view may stay stale until a pass completes.
 *
 * @packageDocumentation
 */
import {GalleryState} from './gallery-commands/GalleryState.ts'
import {GalleryCommandEntry} from "./gallery-commands/GalleryCommandEntry.ts";

/** Progress of a background prune pass: a simulation of repeated redos starting from the gallery as it was when the pass (re)started. */
export interface PruneProgress {
  /** The gallery state the simulation has reached so far. */
  sim: GalleryState
  /** The redo entries the simulation has applied so far. Everything not reached when the simulation ends is stale. */
  reached: readonly GalleryCommandEntry[]
}

/** Simulated cost of one prune step in milliseconds, so the background pruning can be seen in the demo. Set to `0` to disable.
 * Redo and execute never pay it. */
export const PRUNE_STEP_COST_MS = 150

/**
 * Blocks the thread for a while, standing in for an expensive computation.
 *
 * @param ms - How long to block, in milliseconds.
 */
function busyWait(ms: number) {
  const end = performance.now() + ms
  while (performance.now() < end) { /* spin */ }
}

/**
 * Starts a prune pass over a redo stack.
 *
 * @param redoStack - The redo stack to prune.
 * @param gallery - The gallery state the simulated redos start from.
 * @returns A fresh {@link PruneProgress}, or `null` if the stack is empty and there is nothing to prune.
 */
function startPruning(redoStack: readonly GalleryCommandEntry[], gallery: GalleryState): PruneProgress | null {
  return redoStack.length > 0 ? { sim: gallery, reached: [] } : null
}

/**
 * The complete undo/redo state held by the application: the gallery plus its undo and redo stacks.
 *
 * @remarks
 * Immutable by design, like {@link GalleryState}. React detects change by reference, so every operation returns a new `History` and never modifies `this`. When an operation has nothing to do it returns `this`, which lets React skip the re-render.
 * Every method is pure, so it can be used inside a `setState` updater function (`setHistory((h) => h.undo())`): React may run updaters twice or replay them in order, and the result is the same.
 * The rules for what happens to the redo stack, and for pruning, are described in the file header.
 */
export class History {
  /** A history with an empty gallery and no undo or redo entries. The starting point from which every other history is built. */
  static readonly empty = new History(GalleryState.empty, [], [], null, null)

  /** The current gallery contents. */
  readonly gallery: GalleryState
  /** Entries that can be undone; the last element is the most recent. */
  readonly undoStack: readonly GalleryCommandEntry[]
  /** Entries that were undone; the last element is the most recently undone. Redo runs the latest one that can be applied (see {@link History.nextRedo}). Stale entries are removed in the background (see {@link PruneProgress}). */
  readonly redoStack: readonly GalleryCommandEntry[]
  /** The in-flight background prune pass, or `null` when no pass is needed or running. Any change to the gallery restarts an in-flight pass. */
  readonly pruning: PruneProgress | null
  /** The entry the most recent redo moved back onto the undo stack, shown in the UI until the next action. Pure display metadata: it never affects the gallery, redo choice or pruning. */
  readonly lastRedone: GalleryCommandEntry | null

  /**
   * @param gallery - The current gallery contents.
   * @param undoStack - Entries that can be undone, most recent last. The array must not be modified afterwards.
   * @param redoStack - Entries that were undone, most recently undone last. The array must not be modified afterwards.
   * @param pruning - The in-flight prune pass, or `null`.
   * @param lastRedone - The entry the latest redo re-applied, or `null`.
   */
  private constructor(gallery: GalleryState, undoStack: readonly GalleryCommandEntry[], redoStack: readonly GalleryCommandEntry[], pruning: PruneProgress | null, lastRedone: GalleryCommandEntry | null) {
    this.gallery = gallery
    this.undoStack = undoStack
    this.redoStack = redoStack
    this.pruning = pruning
    this.lastRedone = lastRedone
  }

  /** The entry an undo would revert (the most recent one), or `undefined` if there is nothing to undo. */
  get nextUndo(): GalleryCommandEntry | undefined {return this.undoStack.at(-1)}

  /**
   * Finds the entry a redo would run: the most recently undone entry that can be applied to the current state.
   *
   * @returns The entry that would be redone, or `undefined` if no entry can be redone (the Redo button should then be disabled).
   */
  nextRedo(): GalleryCommandEntry | undefined {
    return this.redoStack.findLast((e) => e.canDo(this.gallery))
  }

  /**
   * Performs a new entry: runs it, pushes it on the undo stack, keeps only the redo entries whose `survivesStateChange` accepts the new state, and starts a prune pass (a new action is the only thing that can make redo entries stale).
   *
   * @param entry - The entry to perform.
   * @returns The new history.
   */
  execute(entry: GalleryCommandEntry): History {
    const gallery = entry.do(this.gallery)
    // Keep only redo entries that survive a state change.
    const redoStack = this.redoStack.filter((e) => e.survivesStateChange(gallery))
    return new History(gallery, [...this.undoStack, entry], redoStack, startPruning(redoStack, gallery), null)
  }

  /**
   * Reverts the top undo entry and moves it to the redo stack. Restarts a prune pass that is in flight (and never starts one).
   *
   * @returns The new history, or `this` if there is nothing to undo.
   */
  undo(): History {
    const entry = this.nextUndo
    if (!entry) return this
    const gallery = entry.undo(this.gallery)
    const redoStack = [...this.redoStack, entry]
    return new History(gallery, this.undoStack.slice(0, -1), redoStack, this.pruning && startPruning(redoStack, gallery), null)
  }

  /**
   * Runs the entry chosen by {@link History.nextRedo} against the current state, moves it back to the undo stack, and removes it from the redo stack. Other entries, including ones that cannot be applied right now, stay.
   * Records the entry in `lastRedone` and restarts a prune pass that is in flight (and never starts one).
   *
   * @returns The new history, or `this` if nothing can be redone.
   */
  redo(): History {
    const entry = this.nextRedo()
    if (!entry) return this
    const gallery = entry.do(this.gallery)
    const redoStack = this.redoStack.filter((e) => e !== entry)
    return new History(gallery, [...this.undoStack, entry], redoStack, this.pruning && startPruning(redoStack, gallery), entry)
  }

  /**
   * Advances the background prune pass by one simulated redo. When the simulation can go no further, the entries it never applied are removed from the redo stack and the pass ends.
   *
   * @returns The new history, or `this` if no pass is running.
   */
  pruneStep(): History {
    const p = this.pruning
    if (!p) return this
    busyWait(PRUNE_STEP_COST_MS)
    // One simulated redo: the same choice redo itself would make from the simulated state. Entries in the redo stack have already run, so `do` has no side effects here.
    const next = this.redoStack.findLast((e) => !p.reached.includes(e) && e.canDo(p.sim))
    if (next) return new History(this.gallery, this.undoStack, this.redoStack, { sim: next.do(p.sim), reached: [...p.reached, next] }, this.lastRedone)
    // The simulation cannot go further: anything it never applied can never be redone.
    const kept = this.redoStack.filter((e) => p.reached.includes(e))
    return new History(this.gallery, this.undoStack, kept.length === this.redoStack.length ? this.redoStack : kept, null, this.lastRedone)
  }
}
