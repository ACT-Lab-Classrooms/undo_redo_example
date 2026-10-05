import { useEffect, useState, useTransition } from 'react'
import { CATS } from './cats.ts'
import type { CatId } from './cats.ts'
import { Gallery } from './view-components/Gallery.tsx'
import { CatToolBar } from './view-components/CatToolBar.tsx'
import { HistorySection } from './view-components/HistorySection.tsx'
import { History } from './command-history/History.ts'
import { GalleryState } from './gallery-commands/GalleryState.ts'
import './App.css'
import {MoveCatCommand} from "./gallery-commands/MoveCatCommand.ts";
import {AddCatCommand, RemoveCatCommand} from "./gallery-commands/add-remove-commands.ts";

/**
 * Root component: owns the history state and composes the toolbar, the gallery and the history panel.
 *
 * @remarks
 * All gallery changes go through {@link History} as {@link Command} objects, so every change is undoable.
 *
 * @returns The application UI.
 */
function App() {
  // History is immutable, so every change is a pure updater function: `setHistory((h) => h.undo())`.
  const [history, setHistory] = useState(() => History.of(GalleryState.empty))
  const { state: gallery, undoStack, redoStack, pruning, lastRedone } = history
  // Pruning stale redo entries is an expensive, low-priority task: it runs as transitions so the gallery and buttons never wait for it.
  const [isPruning, startTransition] = useTransition()

  const available = CATS.filter((c) => !gallery.includes(c.id))
  const nextUndo = history.nextUndo
  const redoEntry = history.nextRedo()

  // Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) anywhere on the page.
  useEffect(() => {
    /**
     * Maps undo/redo shortcuts to history operations. Ignored while a `<select>` has focus so its native keyboard behavior is not hijacked.
     *
     * @param e - The keyboard event.
     */
    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.target instanceof HTMLSelectElement) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        setHistory((h) => h.undo())
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        setHistory((h) => h.redo())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Drives the background prune pass one step at a time. Each step runs `pruneStep` inside a transition, so React renders the urgent updates first and keeps showing the old redo stack until the step commits.
  // When a step finishes, `pruning` has changed (or become null), which re-runs this effect for the next step; the pass ends when `pruning` is null.
  useEffect(() => {
    if (pruning && !isPruning) startTransition(() => setHistory((h) => h.pruneStep()))
  }, [pruning, isPruning, startTransition])

  /**
   * Appends a cat to the gallery as an undoable {@link AddCatCommand}.
   *
   * @param id - The cat to add.
   */
  function addCat(id: CatId) {
    // Command pattern: the command records the insertion index (the end of the gallery) when it first runs.
    const entry = new AddCatCommand(id)
    setHistory((h) => h.execute(entry))
  }

  /**
   * Removes a cat as an undoable {@link RemoveCatCommand}.
   *
   * @param id - The cat to remove.
   */
  function removeCat(id: CatId) {
    // Command pattern: the command records the index the cat is removed from when it first runs.
    const entry = new RemoveCatCommand(id)
    setHistory((h) => h.execute(entry))
  }

  /**
   * Moves a cat one slot as an undoable {@link MoveCatCommand}. Does nothing if the move would leave the gallery.
   *
   * @param id - The cat to move.
   * @param direction - `-1` to move toward the start, `1` toward the end.
   */
  function moveCat(id: CatId, direction: -1 | 1) {
    const from = gallery.indexOf(id)
    const to = from + direction
    if (to < 0 || to >= gallery.length) return
    // Snapshot-based command: it records before/after states itself, so undo and redo need no hand-written inverse.
    const entry = new MoveCatCommand(id, direction)
    setHistory((h) => h.execute(entry))
  }

  return (
    <main>
      <h1>Cat Gallery</h1>
      <CatToolBar available={available} undoLabel={nextUndo ? String(nextUndo) : null} redoLabel={redoEntry ? String(redoEntry) : null}
                  onAdd={addCat} onUndo={() => setHistory((h) => h.undo())} onRedo={() => setHistory((h) => h.redo())} />
      <p className="hint">Click or Tab to select a cat · ←/→ changes selection · ↑/↓ moves it · Delete or ✕ removes · Ctrl+Z / Ctrl+Y</p>

      <Gallery gallery={gallery} onRemove={removeCat} onMove={moveCat} />

      <HistorySection undoStack={undoStack} redoStack={redoStack} gallery={gallery} nextRedo={redoEntry} lastRedone={lastRedone} pending={isPruning || pruning !== null} />
    </main>
  )
}

export default App
