import { useCallback, useEffect, useMemo, useState } from 'react'
import { CATS } from './cats.ts'
import type { CatId } from './cats.ts'
import { Gallery } from './view-components/Gallery.tsx'
import { CatToolBar } from './view-components/CatToolBar.tsx'
import { HistorySection } from './view-components/HistorySection.tsx'
import { History } from './command-history/History.ts'
import { GalleryState } from './gallery-commands/GalleryState.ts'
import { MoveCatCommand } from './gallery-commands/MoveCatCommand.ts'
import { AddCatCommand, RemoveCatCommand } from './gallery-commands/add-remove-commands.ts'
import './App.css'

/**
 * Root component: owns the history state and composes the toolbar, the gallery and the history panel.
 *
 * @remarks
 * All gallery changes go through {@link History} as {@link Command} objects, so every change is undoable.
 * History is immutable, so every change is a pure updater function: `setHistory((h) => h.undo())`. Because `setHistory` never changes, the callbacks below are created once, so memoized children are not re-rendered because of them.
 * Each child gets only the props it needs.
 *
 * @returns The application UI.
 */
function App() {
  const [history, setHistory] = useState(() => History.of(GalleryState.empty))
  const gallery = history.state

  const undo = useCallback(() => setHistory((h) => h.undo()), [])
  const redo = useCallback(() => setHistory((h) => h.redo()), [])

  // Side effect: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z anywhere on the page. The listener goes on `window` (outside React's tree) because the shortcuts must work whatever has focus, including `body`.
  // React runs this after rendering. The returned cleanup removes the listener before the effect re-runs and when `App` unmounts. The dependencies are the callbacks the listener closes over: they never change, so it is added once.
  useEffect(() => {
    /**
     * Maps undo/redo shortcuts to the callbacks. Ignored while a `<select>` has focus so its native keyboard behavior is not hijacked.
     *
     * @param e - The keyboard event.
     */
    function onKeyDown(e: KeyboardEvent) {
      if ((!e.ctrlKey && !e.metaKey) || e.target instanceof HTMLSelectElement) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  /**
   * Appends a cat to the gallery as an undoable {@link AddCatCommand}.
   *
   * @param id - The cat to add.
   */
  const addCat = useCallback((id: CatId) => {
    // Command pattern: the command records the insertion index (the end of the gallery) when it first runs.
    const entry = new AddCatCommand(id)
    setHistory((h) => h.execute(entry))
  }, [])

  /**
   * Removes a cat as an undoable {@link RemoveCatCommand}.
   *
   * @param id - The cat to remove.
   */
  const removeCat = useCallback((id: CatId) => {
    // Command pattern: the command records the index the cat is removed from when it first runs.
    const entry = new RemoveCatCommand(id)
    setHistory((h) => h.execute(entry))
  }, [])

  /**
   * Moves a cat one slot as an undoable {@link MoveCatCommand}. Does nothing if the move would leave the gallery.
   *
   * @param id - The cat to move.
   * @param direction - `-1` to move toward the start, `1` toward the end.
   */
  const moveCat = useCallback((id: CatId, direction: -1 | 1) => {
    // Memento command: it saves only the moved cat's position. A move that would leave the gallery changes nothing and is not recorded.
    const entry = new MoveCatCommand(id, direction)
    setHistory((h) => (h.state.move(id, direction) === h.state ? h : h.execute(entry)))
  }, [])

  const available = useMemo(() => CATS.filter((c) => !gallery.includes(c.id)), [gallery])
  const nextRedo = history.nextRedo
  const nextUndo = history.nextUndo

  return (
    <main>
      <h1>Cat Gallery</h1>
      <CatToolBar available={available} undoLabel={nextUndo ? String(nextUndo) : null} redoLabel={nextRedo ? String(nextRedo) : null}
                  onAdd={addCat} onUndo={undo} onRedo={redo} />
      <p className="hint">Click or Tab to select a cat · ←/→ changes selection · ↑/↓ moves it · Delete or ✕ removes · Ctrl+Z / Ctrl+Y</p>

      <Gallery gallery={gallery} onRemove={removeCat} onMove={moveCat} />

      <HistorySection history={history} />
    </main>
  )
}

export default App
