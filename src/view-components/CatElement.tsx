import {memo} from "react";
import {type Cat, catById, type CatId} from "../cats.ts";

/** Props for {@link CatElement}. Everything the element needs to know about the rest of the gallery is boiled down to two booleans and a flash counter. */
interface CatProps {
    /** The cat to show. */
    catId: CatId
    /** Whether this cat is the gallery's selected cat. */
    selected: boolean
    /** Whether this cat is the one card in the tab order (roving tabindex). */
    tabbable: boolean
    /** Starts a brief flash of the card when it changes to a new non-zero value: the parent uses it to show that a key press was received but nothing could be done. `0` means no flash. */
    flash: number
    /**
     * Called when the user selects this cat (click or keyboard focus).
     *
     * @param id - The cat that was selected.
     */
    onSelect: (id: CatId) => void
    /**
     * Called when the user clicks this cat's ✕ button.
     *
     * @param id - The cat to remove.
     */
    onRemove: (id: CatId) => void
    /**
     * Called when this card's flash animation has finished.
     *
     * @param id - The cat whose flash ended.
     */
    onFlashEnd: (id: CatId) => void
}

/**
 * One cat card in the gallery.
 *
 * @remarks
 * A purely presentational component with no state of its own and no knowledge of the other cats: it renders from its props and reports the user's intent (select, remove) through callbacks.
 * Selection is exclusive across the whole gallery, so it is owned by the parent and passed down as `selected`.
 * It is memoized, so when selection changes only the two cards whose `selected` or `tabbable` flag changed re-render, as long as the parent passes stable callbacks.
 * Keyboard shortcuts are handled by the parent list, not here. A new `flash` value renders a short-lived overlay (remounted via its `key`, which restarts the CSS animation) and reports back when the animation ends.
 *
 * @param props - See {@link CatProps}.
 * @returns The cat's list item.
 */
export const CatElement = memo(function CatElement({catId, selected, tabbable, flash, onSelect, onRemove, onFlashEnd}: CatProps) {
    const cat: Cat = catById(catId);
    return (
        <li role="option" aria-selected={selected} tabIndex={tabbable ? 0 : -1} className={selected ? 'card selected' : 'card'}
            onClick={() => onSelect(catId)} onFocus={() => onSelect(catId)}
        >
            <img src={cat.src} alt={cat.name} draggable={false} />
            <span className="name">{cat.name}</span>
            {flash > 0 && <span key={flash} className="flash" aria-hidden="true" onAnimationEnd={() => onFlashEnd(catId)} />}
            <button type="button" className="remove" tabIndex={-1} aria-label={`Remove ${cat.name}`}
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove(catId);
                }}
            >
                ✕
            </button>
        </li>
    )
})
