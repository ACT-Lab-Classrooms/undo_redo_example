import { useCallback, useLayoutEffect, useReducer, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { CatId } from '../cats.ts'
import type { GalleryState } from '../gallery-commands/GalleryState.ts'
import { CatElement } from './CatElement.tsx'
import { galleryUiReducer, initialGalleryUiState } from './galleryUiReducer.ts'

/** Props for {@link Gallery}. */
interface GalleryProps {
  /** The cats to show, in display order. */
  gallery: GalleryState
  /**
   * Called when the user asks to remove a cat (Delete key or the ✕ button).
   *
   * @param id - The cat to remove.
   */
  onRemove: (id: CatId) => void
  /**
   * Called when the user asks to reorder a cat (ArrowUp/ArrowDown).
   *
   * @param id - The cat to move.
   * @param direction - `-1` to move toward the start, `1` toward the end.
   */
  onMove: (id: CatId, direction: -1 | 1) => void
}

/**
 * Displays the cats as a keyboard- and mouse-selectable list.
 *
 * @remarks
 * The gallery owns everything that involves more than one cat: which cat is selected (selection is exclusive), which card is in the tab order, keyboard shortcuts, and keeping focus on the selected card when the list changes.
 * Each {@link CatElement} just renders from two booleans and reports select/remove intents.
 * Clicking or focusing a card selects it. ArrowLeft/ArrowRight rotate the selection through the cats (wrapping around), ArrowUp/ArrowDown move the selected cat, and Delete/Backspace (or its ✕ button) removes it.
 * When a key is understood but nothing can happen (the cat is already at that end of the list, or it is the only cat), the selected card flashes so the user knows the key was received.
 * The component never changes the gallery itself: it only reports remove and move intents through its callbacks.
 * Its own view state (selection and flash) is a small reducer, see {@link galleryUiReducer}.
 *
 * @param props - See {@link GalleryProps}.
 * @returns The gallery list, or an empty-state message when there are no cats.
 */
export function Gallery({ gallery, onRemove, onMove }: GalleryProps) {
  const [{ selectedId, flash }, dispatch] = useReducer(galleryUiReducer, initialGalleryUiState)
  const listRef = useRef<HTMLUListElement>(null)
  // Set when the user's key press will change the gallery or the selection, so the selected card gets focus back afterwards (DOM reordering/removal can drop focus, and rotating moves it).
  const refocusSelected = useRef(false)
  // The newest gallery, for callbacks that must stay the same function across renders (so memoized cards are not re-rendered) but need to look at the current gallery when they run.
  const latestGallery = useRef(gallery)

  // Undo/redo can remove the selected cat, so derive rather than trust state.
  const selected: CatId | null = selectedId && gallery.includes(selectedId) ? selectedId : null
  // A flash belongs to one card: if its cat leaves the gallery mid-flash (its animation never ends), forget it so it does not replay when the cat comes back.
  if (flash && !gallery.includes(flash.id)) dispatch({ type: 'clearFlash' })
  // Roving tabindex: exactly one card is in the tab order.
  const tabbable: CatId | null = selected ?? gallery.at(0) ?? null

  useLayoutEffect(() => {
    latestGallery.current = gallery
  }, [gallery])

  useLayoutEffect(() => {
    if (!refocusSelected.current) return
    refocusSelected.current = false
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
  }, [gallery, selected])

  /**
   * Selects a cat. Keyboard focus is already on its card (or arrives there with the click).
   *
   * @param id - The cat to select.
   */
  const select = useCallback((id: CatId) => dispatch({ type: 'select', id }), [])

  /**
   * Requests removal of a cat and hands selection and focus to a neighbor.
   *
   * @param id - The cat to remove.
   */
  const remove = useCallback((id: CatId) => {
    dispatch({ type: 'select', id: latestGallery.current.neighborOf(id) })
    refocusSelected.current = true
    onRemove(id)
  }, [onRemove])

  /**
   * Called when a card's flash animation has finished, so the flash is not replayed if the cat is removed and later brought back.
   *
   * @param id - The cat whose flash ended.
   */
  const flashEnded = useCallback((id: CatId) => dispatch({ type: 'flashEnded', id }), [])

  /**
   * Handles keyboard shortcuts for the selected cat:
   * - Delete/Backspace removes it,
   * - ArrowUp/ArrowDown move it,
   * - ArrowLeft/ArrowRight select the previous/next cat.
   * Focus is always on the selected card, so the event bubbles up from it.
   *
   * @param e - The keyboard event.
   */
  function handleKeyDown(e: KeyboardEvent) {
    if (!selected) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      remove(selected)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const direction = e.key === 'ArrowUp' ? -1 : 1
      // A move at the edge changes nothing, so there is nothing to refocus after.
      if (gallery.move(selected, direction) === gallery) return dispatch({ type: 'reject', id: selected })
      refocusSelected.current = true
      onMove(selected, direction)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const next = gallery.cycleFrom(selected, e.key === 'ArrowLeft' ? -1 : 1)
      if (!next) return dispatch({ type: 'reject', id: selected })
      refocusSelected.current = true
      dispatch({ type: 'select', id: next })
    }
  }

  if (gallery.length === 0) {
    return <p className="empty">No cats yet. Add one from the menu above.</p>
  }

  return (
    <ul ref={listRef} className="gallery" role="listbox" aria-label="Cat gallery" onKeyDown={handleKeyDown}>
      {Array.from(gallery, (id) => (
        <CatElement key={id} catId={id} selected={id === selected} tabbable={id === tabbable} flash={flash?.id === id ? flash.count : 0} onSelect={select} onRemove={remove} onFlashEnd={flashEnded} />
      ))}
    </ul>
  )
}
