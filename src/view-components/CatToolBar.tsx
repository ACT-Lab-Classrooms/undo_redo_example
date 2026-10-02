import type {Cat, CatId} from "../cats.ts";

/** Props for {@link CatToolBar}. */
interface CatToolBarProps {
    /** The cats that are not in the gallery yet, offered in the add menu. */
    available: readonly Cat[]
    /** Description of the entry Undo would revert, or `null` if there is nothing to undo (the button is disabled). */
    undoLabel: string | null
    /** Description of the entry Redo would re-apply, or `null` if nothing can be redone (the button is disabled). */
    redoLabel: string | null
    /**
     * Called when the user picks a cat from the add menu.
     *
     * @param id - The cat to add.
     */
    onAdd: (id: CatId) => void
    /** Called when the user clicks Undo. */
    onUndo: () => void
    /** Called when the user clicks Redo. */
    onRedo: () => void
}

/**
 * The add-a-cat menu and the Undo/Redo buttons.
 *
 * @remarks
 * Purely presentational: it holds no state and reports the user's intent through callbacks.
 *
 * @param props - See {@link CatToolBarProps}.
 * @returns The toolbar.
 */
export function CatToolBar({available, undoLabel, redoLabel, onAdd, onUndo, onRedo}: CatToolBarProps) {
    return (
        <div className="toolbar">
            {/* Always show the placeholder: picking a cat adds it and the menu resets. */}
            <select value="" onChange={(e) => onAdd(e.target.value as CatId)} disabled={available.length === 0} aria-label="Add a cat">
                <option value="" disabled>{available.length === 0 ? 'All cats added' : 'Add a cat'}</option>
                {available.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
            <span className="spacer" />
            <button type="button" onClick={onUndo} disabled={!undoLabel} title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'}>Undo</button>
            <button type="button" onClick={onRedo} disabled={!redoLabel} title={redoLabel ? `Redo: ${redoLabel} (Ctrl+Y)` : 'Nothing to redo'}>Redo</button>
        </div>
    )
}
