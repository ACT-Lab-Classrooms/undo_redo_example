/**
 * Undo/redo core. Pure TypeScript, no UI code, so it can be read on its own.
 *
 * @remarks
 * The history is generic over the state type `S`; the state must be immutable (every change produces a new state), so snapshots never alias a state that is later modified.
 * Every user action is a subclass of the abstract {@link Command}, and the history only ever deals with that one type. A command can provide its undo in one of three ways:
 *
 * 1. **Hand-written inverse.** Extend {@link Command} and implement {@link Command.undo}. The command remembers just what it needs to invert itself (which cat, which position), so it is cheap in memory, but every action needs its own inverse. See AddCatCommand and RemoveCatCommand.
 *
 * 2. **Memento of the affected part.** Extend `CommandByMemento` and save a `Memento` of only the part of the state the action touches. There is no inverse logic to write, and memory does not grow with the size of the state. See MoveCatCommand.
 *
 * 3. **Memento of the whole state.** Use a `FullStateMemento`. Simplest, but memory grows with the size of the state.
 *
 * Mixing them is safe because undo/redo is strictly LIFO: when an entry is undone, the state is exactly what it was right after that entry ran, so both a position-based inverse and a stored memento are valid.
 *
 * What happens to the redo stack?
 *
 * - When the user does something *new*, redo entries are kept or discarded by {@link Command.survivesStateChange}. A memento command survives only if the part of the state it covers is still as it was (see `Memento.matchesState`):
 *   redoing it recomputes the action, which is only correct from that starting point.
 * - Hand-written commands always survive: they describe an action ("add kaliope at slot 1"), not a state, so they can still be applied to the new state.
 * - Redo runs the most recent entry that can be applied to the current state (see {@link History.nextRedo}, based on {@link Command.canDo}), which is not necessarily the top of the stack. Only that entry is removed from the redo stack.
 * - Entries that redo can never reach are **stale** and get pruned (see below). An entry that cannot be applied *right now* is not necessarily stale: "Removed kaliope" cannot apply while kaliope is absent, but it can once the "Added kaliope" above it has been redone.
 *   Staleness is therefore found by simulating repeated redos from the current state; whatever the simulation never applies is stale.
 *
 * Pruning is treated as an expensive background task. Redo never waits for it (it just skips what it cannot apply), so the state and the Undo/Redo buttons update immediately.
 * The simulation advances one redo step per call of {@link History.pruneStep}, which the UI makes inside a React transition, so the redo stack in the history view may stay stale until a pass completes.
 *
 * @packageDocumentation
 */
import type {Command} from './Command.ts'

/**
 * Progress of a background prune pass: a simulation of repeated redos starting from the state as it was when the pass (re)started.
 *
 * @typeParam S - The type of the state the history tracks.
 */
export interface PruneProgress<S> {
  /** The state the simulation has reached so far. */
  sim: S
  /** The redo entries the simulation has applied so far. Everything not reached when the simulation ends is stale. */
  reached: readonly Command<S>[]
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
 * @param state - The state the simulated redos start from.
 * @returns A fresh {@link PruneProgress}, or `null` if the stack is empty and there is nothing to prune.
 */
function startPruning<S>(redoStack: readonly Command<S>[], state: S): PruneProgress<S> | null {
  return redoStack.length > 0 ? { sim: state, reached: [] } : null
}

/**
 * The complete undo/redo state held by the application: the current state of type `S` plus its undo and redo stacks.
 *
 * @remarks
 * Immutable by design, like the states it tracks. React detects change by reference, so every operation returns a new `History` and never modifies `this`. When an operation has nothing to do it returns `this`, which lets React skip the re-render.
 * Every method is pure, so it can be used inside a `setState` updater function (`setHistory((h) => h.undo())`): React may run updaters twice or replay them in order, and the result is the same.
 * The rules for what happens to the redo stack, and for pruning, are described in the file header.
 *
 * @typeParam S - The type of the state the history tracks. It must be immutable.
 */
export class History<S> {
  /** The current state. */
  readonly state: S
  /** Entries that can be undone; the last element is the most recent. */
  readonly undoStack: readonly Command<S>[]
  /** Entries that were undone; the last element is the most recently undone. Redo runs the latest one that can be applied (see {@link History.nextRedo}). Stale entries are removed in the background (see {@link PruneProgress}). */
  readonly redoStack: readonly Command<S>[]
  /** The in-flight background prune pass, or `null` when no pass is needed or running. Any change to the state restarts an in-flight pass. */
  readonly pruning: PruneProgress<S> | null
  /** The entry the most recent redo moved back onto the undo stack, shown in the UI until the next action. Pure display metadata: it never affects the state, redo choice or pruning. */
  readonly lastRedone: Command<S> | null

  /**
   * Starts a history with no undo or redo entries.
   *
   * @param initial - The initial state.
   * @returns A new history, the starting point from which every other history is built.
   */
  static of<S>(initial: S): History<S> {
    return new History(initial, [], [], null, null)
  }

  /**
   * @param state - The current state.
   * @param undoStack - Entries that can be undone, most recent last. The array must not be modified afterwards.
   * @param redoStack - Entries that were undone, most recently undone last. The array must not be modified afterwards.
   * @param pruning - The in-flight prune pass, or `null`.
   * @param lastRedone - The entry the latest redo re-applied, or `null`.
   */
  private constructor(state: S, undoStack: readonly Command<S>[], redoStack: readonly Command<S>[], pruning: PruneProgress<S> | null, lastRedone: Command<S> | null) {
    this.state = state
    this.undoStack = undoStack
    this.redoStack = redoStack
    this.pruning = pruning
    this.lastRedone = lastRedone
  }

  /** The entry an undo would revert (the most recent one), or `undefined` if there is nothing to undo. */
  get nextUndo(): Command<S> | undefined {
    return this.undoStack.at(-1)
  }

  /**
   * Finds the entry a redo would run: the most recently undone entry that can be applied to the current state.
   *
   * @returns The entry that would be redone, or `undefined` if no entry can be redone (the Redo button should then be disabled).
   */
  nextRedo(): Command<S> | undefined {
    return this.redoStack.findLast((e) => e.canDo(this.state))
  }

  /**
   * Performs a new entry: runs it, pushes it on the undo stack, keeps only the redo entries whose `survivesStateChange` accepts the new state, and starts a prune pass (a new action is the only thing that can make redo entries stale).
   *
   * @param entry - The entry to perform.
   * @returns The new history.
   */
  execute(entry: Command<S>): History<S> {
    const state = entry.do(this.state)
    // Keep only redo entries that survive a state change.
    const redoStack = this.redoStack.filter((e) => e.survivesStateChange(state))
    return new History(state, [...this.undoStack, entry], redoStack, startPruning(redoStack, state), null)
  }

  /**
   * Reverts the top undo entry and moves it to the redo stack. Restarts a prune pass that is in flight (and never starts one).
   *
   * @returns The new history, or `this` if there is nothing to undo.
   */
  undo(): History<S> {
    const entry = this.nextUndo
    if (!entry) return this
    const state = entry.undo(this.state)
    const redoStack = [...this.redoStack, entry]
    return new History(state, this.undoStack.slice(0, -1), redoStack, this.pruning && startPruning(redoStack, state), null)
  }

  /**
   * Runs the entry chosen by {@link History.nextRedo} against the current state, moves it back to the undo stack, and removes it from the redo stack. Other entries, including ones that cannot be applied right now, stay.
   * Records the entry in `lastRedone` and restarts a prune pass that is in flight (and never starts one).
   *
   * @returns The new history, or `this` if nothing can be redone.
   */
  redo(): History<S> {
    const entry = this.nextRedo()
    if (!entry) return this
    const state = entry.do(this.state)
    const redoStack = this.redoStack.filter((e) => e !== entry)
    return new History(state, [...this.undoStack, entry], redoStack, this.pruning && startPruning(redoStack, state), entry)
  }

  /**
   * Advances the background prune pass by one simulated redo. When the simulation can go no further, the entries it never applied are removed from the redo stack and the pass ends.
   *
   * @returns The new history, or `this` if no pass is running.
   */
  pruneStep(): History<S> {
    const p = this.pruning
    if (!p) return this
    busyWait(PRUNE_STEP_COST_MS)
    // One simulated redo: the same choice redo itself would make from the simulated state. Calling `do` on an entry that has already run must have no side effects (commands record what they need only on their first run).
    const next = this.redoStack.findLast((e) => !p.reached.includes(e) && e.canDo(p.sim))
    if (next) return new History(this.state, this.undoStack, this.redoStack, { sim: next.do(p.sim), reached: [...p.reached, next] }, this.lastRedone)
    // The simulation cannot go further: anything it never applied can never be redone.
    const kept = this.redoStack.filter((e) => p.reached.includes(e))
    return new History(this.state, this.undoStack, kept.length === this.redoStack.length ? this.redoStack : kept, null, this.lastRedone)
  }
}
