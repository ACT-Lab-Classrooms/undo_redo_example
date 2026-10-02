# Cat Gallery: Undo/Redo and React Teaching Example

A small React 19 + TypeScript app (Vite, **stock React only, no libraries**) built to teach undo/redo in a GUI-programming course. Users add cat photos from a dropdown, select, reorder and remove them, and can Undo/Redo every change. An always-visible **History panel** exposes the internals so students can watch the undo and redo stacks while they use the app.

Note on the code: all user actions are deliberately tiny (add, remove, move one cat), so the *undo/redo machinery* is the thing on display. The code is heavily TSDoc-commented (TypeDoc-friendly) and uses lines up to 300 characters.

## 1. Features
- "Add a cat" dropdown (six cats: bruce, kaliope, kizzy, polymnia, sarah, sparrow); adds to the end.
- Selection (click, Tab, roving tabindex). Keyboard on the selected cat: **Delete/Backspace** remove, **Up/Down** move it, **Left/Right** rotate selection (wraps). If a key is understood but can't do anything (cat at the end of the list, only one cat) the card **flashes**.
- **Undo / Redo** buttons plus Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z.
- History panel: undo stack and redo stack (newest first) with badges "next undo", "next redo", "↻ redone", and greyed "skipped" redo entries.
- Redo stack entries that can never be redone are **pruned in the background** (deliberately slow demo: 150 ms per step).

## 2. File map (`src/`)
| File | Role |
|---|---|
| `gallery-commands/GalleryState.ts` | The application state that undo/redo operates on: an **immutable** class holding the ordered cat ids. |
| `gallery-commands/GalleryCommandEntry.ts` | Abstract command base class (`GalleryCommandEntry`) and abstract subclass `CommandWithoutCachedState`. |
| `gallery-commands/add-remove-commands.ts` | `AddCatCommand`, `RemoveCatCommand`: commands with hand-written inverses. |
| `gallery-commands/MoveCatCommand.ts` | `MoveCatCommand`: a command using the default snapshot behavior. |
| `history.ts` | Pure TypeScript undo/redo core: the immutable `History` class (`execute`, `undo`, `redo`, `nextRedo`, `pruneStep`) and the pruning helpers. No UI code, readable on its own. |
| `App.tsx` | Owns the history (`useState<History>` with updater functions like `setHistory(h => h.undo())`), turns UI intents into commands, runs the pruning transition, Ctrl+Z/Y listener. |
| `view-components/CatToolBar.tsx` | Presentational: add menu, Undo, Redo. |
| `view-components/Gallery.tsx` | The list: selection, roving tabindex, keyboard shortcuts, focus restoration, flash state. |
| `view-components/CatElement.tsx` | Memoized presentational card; knows only `selected`, `tabbable`, `flash`. |
| `view-components/HistorySection.tsx` | Presentational: the two stacks with the status badges. |
| `cats.ts` | Cat data (`CatId`, `CATS`, `catById`). |

(`src/RedoStackItem.tsx` exists but is an empty placeholder.)

## 3. Undo/redo concepts taught

### 3.1 Command pattern with one unified history stack
Every user action is an object extending the abstract `GalleryCommandEntry`; the history only ever deals with that one type. A subclass must define `action(state)`, the change itself, plus `toString()` for the UI. Other hooks:

| Hook | Meaning |
|---|---|
| `action(state)` | The change. Must not mutate `state`. |
| `do(state)` | Perform/redo. Default = snapshot behavior (below). |
| `undo(state)` | Reverse. Default = restore the recorded "before" snapshot. |
| `canDo(state)` | Can this entry be applied to this state *right now*? (default true) |
| `survivesStateChange(state)` | After a *new* user action, may this redo entry stay on the redo stack? |
| `toString()` | Past-tense description shown in the History panel and tooltips. |

### 3.2 Two ways to get undo/redo (and they mix safely)
1. **Snapshot (memento) style, the default.** Implement only `action`. The base class records the state before and after the first run; undo restores `before`, redo replays `after`. No inverse logic to get wrong, but memory grows with state size and a cached `after` is only valid from the exact state it was recorded against. Example: `MoveCatCommand`.
2. **Programmer-defined inverse.** Extend `CommandWithoutCachedState` (its `do` just runs `action` each time) and override `undo` by hand. Cheap in memory, but every action needs a correct inverse. The command captures what it needs (which cat, which position). Examples: `AddCatCommand` (undo = remove the cat), `RemoveCatCommand` (undo = re-add at the recorded position; it records the index only on the first run so redo doesn't re-capture).

Mixing is safe because undo is strictly **LIFO**: when an entry is undone, the state is exactly what it was right after that entry ran, so both a position-based inverse and a stored snapshot are valid.

### 3.3 Selective redo
After undoing, a new action normally destroys redo history in simple editors. Here it does not always:
- On a new action, snapshot entries are dropped unless the current state equals the state they were recorded against (`survivesStateChange` default). Inverse-style commands always survive because they describe an *action* ("add kaliope"), not a *state*.
- **Redo runs the most recent entry that can be applied** to the current state (`History.nextRedo()` = `redoStack.findLast(e => e.canDo(gallery))`), not necessarily the top of the stack. Only that entry leaves the redo stack. The Redo button and tooltip use the same function.
- Skipped entries are shown greyed with a "skipped" badge in the History panel.

### 3.4 Deliberate discussion case: stale index on redo
There is no "rebase" of recorded positions. Sequence: gallery `[bruce, sarah, kizzy]`, remove bruce (recorded index 0 stays valid), undo, remove kizzy, redo, undo gives `[sarah, bruce]` rather than the original order. The recorded index of an inverse command can be wrong relative to a changed state. This was kept intentionally as a case for students to discuss (no hint comments in code). Fixes to explore: rebasing/transforming recorded positions (as operational-transform editors do), snapshot style, or pruning.

### 3.5 Stale redo entries and background pruning (React concurrency demo)
- **Not applicable now is not the same as stale.** "Removed kaliope" can't apply while kaliope is absent, but can once the "Added kaliope" above it is redone. So staleness is defined by **simulating repeated redos** from the current state: any entry the simulation never reaches is stale and gets pruned.
- Pruning is treated as an **expensive background task** (simulated with a 150 ms busy-wait, constant `PRUNE_STEP_COST_MS`). The gallery, buttons and redo behavior update immediately; the History panel may keep showing a stale entry (dimmed, `aria-busy`) until the pass completes.
- Implementation: `History.pruning` holds the in-flight simulation `{sim, reached}`. `execute` starts a pass; `undo`/`redo` restart one in flight; `pruneStep()` advances one simulated redo and, when the simulation is stuck, removes unreached entries. An effect in `App` runs one step at a time inside **`startTransition`**: `startTransition(() => setHistory(h => h.pruneStep()))`.
- Teaching points: `startTransition` runs its callback synchronously, so the expensive work lives in the **updater function** (`h => h.pruneStep()`), which React runs during the low-priority transition render; React replays skipped updates in order, so a pure updater stays correct when a transition is interrupted; transitions are only interruptible *between components*, so a single step still blocks (hence the small step size); `useTransition`'s `isPending` plus the `pruning` state drive the dimmed UI.
- Correctness was checked by fuzzing `History` (millions of steps) and comparing interrupted passes against a direct "repeated redo" computation.

### 3.6 "Redone" indicator
`History.lastRedone` holds the entry the most recent redo moved back to the undo stack. It is display-only metadata (never affects gallery, redo choice or pruning) and is cleared by any new action or undo. The panel shows it as "↻ redone" with a brief highlight.

## 4. React concepts taught

### 4.1 Immutable state objects
`GalleryState` is an immutable class (private constructor, `GalleryState.empty`, `add(id, index?)`, `remove(id)` returning `{state, index}`, `move(id, ±1)`, `neighborOf`, `cycleFrom`, `equals`, iterable). Operations return a new instance, or **`this` when nothing changes**, so React's `useState` can bail out by reference and undo snapshots never alias mutated state. Mutating a state in place would silently corrupt every snapshot in the history.

### 4.2 An immutable `History` class with `useState` updaters
`History` follows the same pattern as `GalleryState`: a private constructor, `History.empty`, read-only fields (`gallery`, `undoStack`, `redoStack`, `pruning`, `lastRedone`) and pure methods that return a new `History` (or `this` when nothing can be done). `App` holds it in `useState` and applies operations with updater functions (`setHistory(h => h.undo())`). An updater has the same rules as a reducer (pure; React may run it twice in StrictMode or replay it in order), so nothing is lost by not using `useReducer`; the class's method names replace the action types and the `switch`. A reducer would add value only if actions needed to be data (logging, replay). Pure classes are testable without React (the fuzz tests do this).

### 4.3 Component decomposition and isolated state
- `App` owns the history and turns UI events into commands; it passes **only what each child needs**.
- `CatToolBar` and `HistorySection` are presentational (no state; props in, callbacks out).
- `Gallery` owns what spans several cats: exclusive selection (`useState`), roving tabindex, key handling, focus restoration.
- `CatElement` is a `React.memo` component with no state that knows only `selected`, `tabbable` and a `flash` counter, and reports select/remove upward. A selection change re-renders only the two affected cards; a flash re-renders only the flashed card. This requires stable handlers (`useCallback`) from the parent.
- Why selection is in `Gallery` rather than in each card or a reducer: it is exclusive, so each card owning its own flag could not stay consistent. Plain `useState` was chosen over a reducer.

### 4.4 Derived state instead of synchronized state
`selected` is derived each render (`selectedId` only if still in the gallery), because undo/redo can remove the selected cat. A flash for a cat that has left the gallery is reset during render, which prevents it replaying when undo brings the cat back.

### 4.5 Accessibility and keyboard handling
Listbox/option roles, roving tabindex (exactly one card tabbable), `aria-selected`, `aria-busy`, key handling in one `onKeyDown` on the list (events bubble from the focused card), modifier keys ignored so browser/app shortcuts work, `preventDefault` so arrows don't scroll the page. Focus is restored after DOM changes with a ref to the list, a "refocus" flag ref and a `useLayoutEffect`.

### 4.6 CSS-driven feedback without timers
The flash is a `<span key={flash}>` overlay; changing `key` remounts it and restarts the CSS animation, and `onAnimationEnd` clears it. The redone highlight in the History panel uses the same remount-by-key trick. Feedback pairs colour with text badges so it does not rely on colour alone.

## 5. Suggested lecture threads
1. State as a value: why immutable `GalleryState` makes undo trivial (snapshots) and React cheap (reference equality).
2. Memento vs. command: implement Move (snapshot) and Add/Remove (inverse); compare memory and correctness.
3. LIFO invariant: why mixing strategies is safe.
4. What should a new action do to the redo stack? Walk through `survivesStateChange`, selective redo, and `canDo`.
5. Break it: the stale-index scenario in 3.4; discuss rebasing/operational transform.
6. Expensive work and responsiveness: the pruning pass, `useTransition`, interruptible renders, the updater function as the place where transition work runs.
7. Component design: isolating `CatElement`, `React.memo` and stable callbacks, derived vs. stored state.
8. Accessible keyboard UI: roving tabindex, focus management, feedback for "nothing happened".

## 6. Running and checking
- `npm install`, `npm run dev` to run; `npm run lint` (ESLint 10 flat config, `max-len` 300, unused vars allowed only with a `_` prefix) and `npm run build` (`tsc -b` with `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noUnusedLocals/Parameters`).
- To see pruning: add kaliope, remove kaliope, undo, add kaliope again; the redo entry "Removed kaliope" shows greyed and "skipped", the History panel dims, and about 150 ms later the entry disappears. Lower or zero `PRUNE_STEP_COST_MS` in `history.ts` to remove the delay.
- Verified headlessly (jsdom, real `App`) for keyboard behavior, memoization, flash and history badges. Not yet verified in a real browser: visual appearance in light/dark mode, focus after reordering, and StrictMode double effects.
