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
 * The history is two stacks:
 *
 * - **do:** run the command, push it on the undo stack, and clear the redo stack (a new action starts a new future).
 * - **undo:** pop the top of the undo stack, revert it, and push it on the redo stack.
 * - **redo:** pop the top of the redo stack, run it again, and push it back on the undo stack.
 *
 * Undo and redo are strictly last-in-first-out: when an entry is undone or redone, the state is exactly what it was right before or after that entry first ran, so any of the three kinds of undo is valid.
 *
 * @packageDocumentation
 */
import type {Command} from './Command.ts'

/**
 * The complete undo/redo state held by the application: the current state of type `S` plus its undo and redo stacks.
 *
 * @remarks
 * Immutable by design, like the states it tracks. React detects change by reference, so every operation returns a new `History` and never modifies `this`. When an operation has nothing to do it returns `this`, which lets React skip the re-render.
 * Every method is pure, so it can be used inside a `setState` updater function (`setHistory((h) => h.undo())`): React may run updaters twice or replay them in order, and the result is the same.
 *
 * @typeParam S - The type of the state the history tracks. It must be immutable.
 */
export class History<S> {
  /** The current state. */
  readonly state: S
  /** Entries that can be undone; the last element is the most recent. */
  readonly undoStack: readonly Command<S>[]
  /** Entries that were undone; the last element is the most recently undone, and is the one redo runs. */
  readonly redoStack: readonly Command<S>[]

  /**
   * Starts a history with no undo or redo entries.
   *
   * @param initial - The initial state.
   * @returns A new history, the starting point from which every other history is built.
   */
  static of<S>(initial: S): History<S> {
    return new History(initial, [], [])
  }

  /**
   * @param state - The current state.
   * @param undoStack - Entries that can be undone, most recent last. The array must not be modified afterwards.
   * @param redoStack - Entries that were undone, most recently undone last. The array must not be modified afterwards.
   */
  private constructor(state: S, undoStack: readonly Command<S>[], redoStack: readonly Command<S>[]) {
    this.state = state
    this.undoStack = undoStack
    this.redoStack = redoStack
  }

  /** The entry an undo would revert (the most recent one), or `undefined` if there is nothing to undo. */
  get nextUndo(): Command<S> | undefined {
    return this.undoStack.at(-1)
  }

  /** The entry a redo would run (the most recently undone one), or `undefined` if there is nothing to redo. */
  get nextRedo(): Command<S> | undefined {
    return this.redoStack.at(-1)
  }

  /**
   * Performs a new entry: runs it, pushes it on the undo stack, and clears the redo stack.
   *
   * @param entry - The entry to perform.
   * @returns The new history.
   */
  execute(entry: Command<S>): History<S> {
    return new History(entry.do(this.state), [...this.undoStack, entry], [])
  }

  /**
   * Reverts the top undo entry and moves it to the redo stack.
   *
   * @returns The new history, or `this` if there is nothing to undo.
   */
  undo(): History<S> {
    const entry = this.nextUndo
    if (!entry) return this
    return new History(entry.undo(this.state), this.undoStack.slice(0, -1), [...this.redoStack, entry])
  }

  /**
   * Runs the top redo entry again and moves it back to the undo stack.
   *
   * @returns The new history, or `this` if there is nothing to redo.
   */
  redo(): History<S> {
    const entry = this.nextRedo
    if (!entry) return this
    return new History(entry.do(this.state), [...this.undoStack, entry], this.redoStack.slice(0, -1))
  }
}
