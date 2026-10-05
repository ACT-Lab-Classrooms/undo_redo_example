# Cat Gallery: Undo/Redo and React Teaching Example

A small React 19 + TypeScript app (Vite, **stock React only, no libraries**) built to teach undo/redo in a GUI-programming course. Users add cat photos from a dropdown, select, reorder and remove them, and can Undo/Redo every change. An always-visible **History panel** exposes the internals so students can watch the undo and redo stacks while they use the app.

Note on the code: all user actions are deliberately tiny (add, remove, move one cat), so the *undo/redo machinery* is the thing on display. The code is heavily TSDoc-commented (TypeDoc-friendly) and uses lines up to 300 characters.

## 1. Features
- "Add a cat" dropdown (six cats: bruce, kaliope, kizzy, polymnia, sarah, sparrow); adds to the end.
- Selection (click, Tab, roving tabindex). Keyboard on the selected cat: **Delete/Backspace** remove, **Up/Down** move it, **Left/Right** rotate selection (wraps). If a key is understood but can't do anything (cat at the end of the list, only one cat) the card **flashes**.
- **Undo / Redo** buttons plus Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z.
- History panel: undo stack and redo stack (newest first) with badges "next undo" and "next redo".
- Classic two-stack history: a new action clears the redo stack.

## 2. File map (`src/`)
| File | Role |
|---|---|
| `gallery-commands/GalleryState.ts` | The application state that undo/redo operates on: an **immutable** class holding the ordered cat ids. |
| `command-history/Command.ts` | The generic Command and Memento patterns over any state type `S`: `Memento<S>`, `FullStateMemento<S>`, abstract `Command<S>` (hand-written inverse) and abstract `CommandByMemento<S, M>` (undo from a memento of the affected part). |
| `gallery-commands/add-remove-commands.ts` | `AddCatCommand`, `RemoveCatCommand`: commands with hand-written inverses. |
| `gallery-commands/MoveCatCommand.ts` | `MoveCatCommand` and its slim `MoveCatMemento` (saves only the moved cat and its position). |
| `command-history/History.ts` | Pure TypeScript undo/redo core: the generic immutable `History<S>` class (`execute`, `undo`, `redo`, `nextUndo`, `nextRedo`). No UI code, readable on its own. |
| `App.tsx` | Owns the history (`useState<History>` with updater functions like `setHistory(h => h.undo())`), creates the stable action callbacks, turns UI intents into commands, composes the children and passes each only the props it needs. |
| `view-components/CatToolBar.tsx` | Presentational: add menu, Undo, Redo (`useId` for the label). |
| `view-components/Gallery.tsx` | The list: selection, roving tabindex, keyboard shortcuts, focus restoration. UI state in `useReducer` (`galleryUiReducer.ts`). |
| `view-components/CatElement.tsx` | Memoized presentational card; knows only `selected`, `tabbable`, `flash`. |
| `view-components/HistorySection.tsx` | The two stacks with the "next undo" / "next redo" badges. |
| `cats.ts` | Cat data (`CatId`, `CATS`, `catById`). |

(`src/RedoStackItem.tsx` exists but is an empty placeholder.)

## 3. Undo/redo concepts taught

### 3.1 Command pattern with one unified history stack
The history is generic over the state type `S` (here `GalleryState`). Every user action is an object extending the abstract `Command<S>`; the history only ever deals with that one type. A subclass must define `action(state)`, the change itself, `undo(state)`, and `toString()` for the UI. Other hooks:

| Hook | Meaning |
|---|---|
| `action(state)` | The change. Must not mutate `state`. |
| `do(state)` | Perform/redo. Runs `action`. |
| `undo(state)` | Reverse the change (hand-written, or from a memento in `CommandByMemento`). |
| `toString()` | Past-tense description shown in the History panel and tooltips. |

### 3.2 Command and Memento patterns, in three flavors (they mix safely)
1. **Hand-written inverse.** Extend `Command<S>` and implement `undo` yourself. Cheap in memory (the command remembers just which cat and which position), but every action needs a correct inverse. Examples: `AddCatCommand` (undo = remove the cat), `RemoveCatCommand` (undo = re-add at the recorded position; it records the index only on the first run so redo doesn't re-capture).
2. **Memento of the affected part.** Extend `CommandByMemento<S, M>` and implement `createMemento(state)`, which saves *only the part of the state the action touches*. `Memento<S>` has `applyToState(state)` (put the saved part back, leave the rest alone). Example: `MoveCatCommand` saves a `MoveCatMemento` holding just the cat and its original position, so its size does not depend on how many cats there are, and there is no inverse to write.
3. **Memento of the whole state.** `FullStateMemento<S>` saves the entire state: simplest, but memory grows with the size of the state. It is the baseline the partial memento is compared with.

The memento is taken once, on the first run. Redo runs `action` again on the current state, which is exactly the state the command first ran on.

Mixing is safe because undo is strictly **LIFO**: when an entry is undone, the state is exactly what it was right after that entry ran, so both a position-based inverse and a stored memento are valid.

### 3.3 The two stacks
- **do:** run the command, push it on the undo stack, clear the redo stack (a new action starts a new future).
- **undo:** pop the undo stack, revert, push on the redo stack.
- **redo:** pop the redo stack, run again, push on the undo stack.
- With nothing to undo/redo the methods return `this`, so React skips the re-render and the buttons are disabled.

## 4. React concepts taught

### 4.1 Immutable state objects
`GalleryState` is an immutable class (private constructor, `GalleryState.empty`, `add(id, index?)`, `remove(id)` returning `{state, index}`, `move(id, ±1)`, `neighborOf`, `cycleFrom`, `equals`, iterable). Operations return a new instance, or **`this` when nothing changes**, so React's `useState` can bail out by reference and undo snapshots never alias mutated state. Mutating a state in place would silently corrupt every snapshot in the history.

### 4.2 An immutable `History` class with `useState` updaters
`History` follows the same pattern as `GalleryState`: a private constructor, `History.of(initial)`, read-only fields (`state`, `undoStack`, `redoStack`) and pure methods that return a new `History` (or `this` when nothing can be done). `App` holds it in `useState` and applies operations with updater functions (`setHistory(h => h.undo())`). An updater has the same rules as a reducer (pure; React may run it twice in StrictMode or replay it in order), so nothing is lost by not using `useReducer`; the class's method names replace the action types and the `switch`. A reducer would add value only if actions needed to be data (logging, replay). Pure classes are testable without React.

### 4.3 Component decomposition and isolated state
- `App` owns the history and turns UI events into commands; it passes **only what each child needs** (the toolbar gets labels and add/undo/redo callbacks, the gallery gets the gallery and remove/move callbacks).
- `CatToolBar` and `HistorySection` have no state of their own (props in, callbacks out).
- `Gallery` owns what spans several cats: exclusive selection (`useReducer`), roving tabindex, key handling, focus restoration.
- `CatElement` is a `React.memo` component with no state that knows only `selected`, `tabbable` and a `flash` counter, and reports select/remove upward. A selection change re-renders only the two affected cards; a flash re-renders only the flashed card. This requires stable handlers (`useCallback`) from the parent.
- Why selection is in `Gallery` rather than in each card or a reducer: it is exclusive, so each card owning its own flag could not stay consistent. It is a small `useReducer` (select, reject, flashEnded, clearFlash): the contrast with the `History` class is deliberate, a handful of view flags versus a domain model with its own rules.

### 4.4 Derived state instead of synchronized state
`selected` is derived each render (`selectedId` only if still in the gallery), because undo/redo can remove the selected cat. A flash for a cat that has left the gallery is reset during render, which prevents it replaying when undo brings the cat back.

### 4.5 Accessibility and keyboard handling
Listbox/option roles, roving tabindex (exactly one card tabbable), `aria-selected`, `aria-busy`, key handling in one `onKeyDown` on the list (events bubble from the focused card), modifier keys ignored so browser/app shortcuts work, `preventDefault` so arrows don't scroll the page. Focus is restored after DOM changes with a ref to the list, a "refocus" flag ref and a `useLayoutEffect`.

### 4.6 CSS-driven feedback without timers
The flash is a `<span key={flash}>` overlay; changing `key` remounts it and restarts the CSS animation, and `onAnimationEnd` clears it. Feedback pairs colour with text badges so it does not rely on colour alone.

### 4.7 Hooks tour: where each built-in hook is used and what it teaches
| Hook | Where | Teaches | When NOT to use it |
|---|---|---|---|
| `useState` (lazy init) | `App` | Immutable value + pure updaters | Derivable values (use plain variables) |
| `useReducer` | `Gallery` (`galleryUiReducer.ts`) | UI state as actions + pure reducer, versus the `History` class for domain state | One independent value |
| `useMemo` | `App` (available cats) | Caching a derived list so they are recomputed only when their inputs change | Cheap computations (measure first) |
| `useCallback` + `memo` | `App` (action callbacks), `Gallery`, `CatElement` | Stable handlers so memoized cards skip renders | Handlers passed to non-memoized children |
| `useRef` | `Gallery` (list node, refocus flag, latest gallery) | Values that persist without causing renders; the "latest value" pattern that keeps `remove` stable | Anything the UI must display reactively |
| `useEffect` | `App` (Ctrl+Z/Y keyboard shortcuts) | Syncing with something outside React: subscribe on `window`, return a cleanup, list the values the listener closes over; why the global listener is not an `onKeyDown` prop (focus can be on `body`) | Computing values for render |
| `useLayoutEffect` | `Gallery` | Focus restoration and the latest-gallery ref before paint | Most effects |
| `useId` | `CatToolBar`, `HistorySection` | Unique ids for label/`aria-labelledby` links | List keys |
Not used on purpose: `useTransition`/`useDeferredValue` (no slow work left once pruning was removed), custom hooks (the one shortcut effect stays inline in `App` so the `useEffect` lesson is in one place), `useContext` (the toolbar and gallery use different actions and are direct children of `App`, so props are clearer; context pays off for values needed at many depths), `useOptimistic`, `useSyncExternalStore`, `useImperativeHandle`, `useEffectEvent` (candidates for later demos).

## 5. Suggested lecture threads
1. State as a value: why immutable `GalleryState` makes undo trivial (snapshots) and React cheap (reference equality).
2. Memento vs. command: implement Move (memento of the affected part) and Add/Remove (inverse); compare memory (`MoveCatMemento` vs. `FullStateMemento`) and correctness.
3. LIFO invariant: why mixing strategies is safe.
4. What should a new action do to the redo stack? Classic answer: clear it. Discuss what editors that keep branches (undo trees) do instead.
5. Component design: isolating `CatElement`, `React.memo` and stable callbacks, derived vs. stored state.
6. Accessible keyboard UI: roving tabindex, focus management, feedback for "nothing happened".

## 6. Running and checking
- `npm install`, `npm run dev` to run; `npm run lint` (ESLint 10 flat config, `max-len` 300, unused vars allowed only with a `_` prefix) and `npm run build` (`tsc -b` with `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noUnusedLocals/Parameters`).
- To see the stacks: add three cats, undo twice (they move to the redo stack), redo once, then add another cat: the redo stack empties.
- Verified headlessly (jsdom, real `App`) for keyboard behavior, memoization, flash and history badges. Not yet verified in a real browser: visual appearance in light/dark mode, focus after reordering, and StrictMode double effects.
