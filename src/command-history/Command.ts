/**
 * Generic Command and Memento patterns for undo/redo over any state type.
 *
 * @remarks
 * A {@link Command} describes one user action on a state `S` and knows how to undo it. There are two ways to provide the undo:
 *
 * 1. **Hand-written inverse.** Extend {@link Command} and implement {@link Command.undo} yourself. The command object remembers just what it needs to invert itself (which cat, which position).
 * 2. **Memento.** Extend {@link CommandByMemento}. Before the action first runs, the command saves a {@link Memento}: a snapshot of *the part of the state the action affects*. Undo hands the memento the current state and it puts its part back.
 *    A {@link FullStateMemento} saves the whole state, which is simple but costs memory proportional to the state. A partial memento saves only what the action touches, so its cost does not grow with the state.
 *
 * @packageDocumentation
 */

/**
 * A saved piece of a state `S`, taken before a command changed it.
 *
 * @typeParam S - The type of the whole state the memento belongs to.
 */
export interface Memento<S> {

    /**
     * Puts the saved part back into a state, leaving every other part of the state as it is.
     *
     * @param state - The current state.
     * @returns The state with the saved part restored. Must not mutate `state`.
     */
    applyToState(state: S): S

    /**
     * Tests whether the part of a state that this memento covers is still as it was when the memento was taken.
     *
     * @param state - The state to test.
     * @returns `true` if the command that produced this memento would affect `state` the same way it affected the original state.
     */
    matchesState(state: S): boolean
}

/**
 * A memento that saves the entire state: simple, but its memory cost grows with the size of the state.
 *
 * @typeParam S - The type of the state.
 */
export class FullStateMemento<S> implements Memento<S> {
    /** The saved state. */
    private readonly state: S
    /** How two states are compared by {@link FullStateMemento.matchesState}. */
    private readonly equals: (a: S, b: S) => boolean

    /**
     * @param state - The state to save. It must not be modified afterwards (use immutable states).
     * @param equals - How to compare two states. Defaults to reference equality; pass a value comparison for states that can be equal without being the same object.
     */
    constructor(state: S, equals: (a: S, b: S) => boolean = Object.is) {
        this.state = state
        this.equals = equals
    }

    /**
     * @param _state - The current state (ignored: the whole state is replaced).
     * @returns The saved state.
     */
    applyToState(_state: S): S {
        return this.state
    }

    /**
     * @param state - The state to test.
     * @returns `true` if `state` equals the saved state.
     */
    matchesState(state: S): boolean {
        return this.equals(this.state, state)
    }
}

/**
 * Base class for every undoable user action on a state `S`.
 *
 * @remarks
 * By itself a command caches nothing: {@link Command.do} runs {@link Command.action} every time, so the command must describe a change that can be applied to whatever the state is, and subclasses supply a hand-written {@link Command.undo}.
 * Commands that would rather not write an inverse can extend {@link CommandByMemento}.
 *
 * @typeParam S - The type of the state the command changes. States must be treated as immutable.
 */
export abstract class Command<S> {
    /**
     * The change this command makes. Subclasses must define it.
     *
     * @param state - The state to apply the change to.
     * @returns The new state. Must not mutate `state`.
     */
    protected abstract action(state: S): S

    /**
     * Reverses the command.
     *
     * @param state - The current state, which is the state this command produced (undo is strictly last-in-first-out).
     * @returns The state with the command's effect undone.
     */
    abstract undo(state: S): S

    /**
     * Performs (or redoes) the command.
     *
     * @param state - The current state.
     * @returns The state after the command.
     */
    do(state: S): S {
        return this.action(state)
    }

    /**
     * Reports whether {@link Command.do} can meaningfully be applied to a state. Redo skips commands for which this is false.
     *
     * @param _state - The state the command would be applied to.
     * @returns `true` if the command still applies. The default is always `true`.
     */
    canDo(_state: S): boolean {
        return true
    }

    /**
     * Whether this command can still be redone once the state has changed (for example after the user performs a new action).
     *
     * @param _currentState - The state a redo would start from.
     * @returns `true` if the command can still be redone. By default always, because a plain command describes an action, not a state.
     */
    survivesStateChange(_currentState: S): boolean {
        return true
    }

    /**
     * Describes what this command did, in enough detail to be clear in the user interface (tooltips and the History panel).
     *
     * @returns A past-tense, human-readable description such as `"Added bruce at position 2"`. Positions are 1-based.
     */
    abstract toString(): string
}

/**
 * A command whose undo is provided by a {@link Memento} of the part of the state it affects, so the subclass does not write an inverse.
 *
 * @remarks
 * The memento is created once, the first time the command runs. Redo runs {@link Command.action} again on the current state instead of replaying a stored result, which is only correct while the affected part of the state is as it was.
 * {@link CommandByMemento.canDo} and {@link CommandByMemento.survivesStateChange} check that with {@link Memento.matchesState}.
 * Because `do` records nothing after its first run, it has no side effects on later calls, so it is safe to call on a simulated state (the background pruning does).
 *
 * @typeParam S - The type of the state the command changes.
 * @typeParam M - The type of memento this command uses.
 */
export abstract class CommandByMemento<S, M extends Memento<S>> extends Command<S> {
    /** The memento taken just before the first run of {@link Command.action}. */
    private before: M | undefined

    /**
     * Saves the part of the state this command is about to change. Subclasses decide what that part is.
     *
     * @param state - The state just before the command first runs.
     * @returns A memento of the affected part of `state`.
     */
    protected abstract createMemento(state: S): M

    /**
     * Performs (or redoes) the command, taking the memento the first time.
     *
     * @param state - The current state.
     * @returns The state after the command.
     */
    override do(state: S): S {
        this.before ??= this.createMemento(state)
        return this.action(state)
    }

    /**
     * Restores the affected part of the state from the memento.
     *
     * @param state - The current state, which is the state this command produced.
     * @returns The restored state, or `state` unchanged if the command never ran.
     */
    override undo(state: S): S {
        return this.before ? this.before.applyToState(state) : state
    }

    /**
     * @param state - The state the command would be applied to.
     * @returns `true` if the command has not run yet, or the affected part of `state` is as it was when the memento was taken.
     */
    override canDo(state: S): boolean {
        return this.before === undefined || this.before.matchesState(state)
    }

    /**
     * @param currentState - The state a redo would start from.
     * @returns `true` only if the command has run and the affected part of `currentState` is as it was when the memento was taken.
     */
    override survivesStateChange(currentState: S): boolean {
        return this.before !== undefined && this.before.matchesState(currentState)
    }
}
