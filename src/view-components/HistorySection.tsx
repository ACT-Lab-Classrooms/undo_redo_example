import type {Command} from "../command-history/Command.ts";
import type {GalleryState} from "../gallery-commands/GalleryState.ts";

/** Props for {@link HistorySection}. */
interface HistorySectionProps {
    /** Entries that can be undone; the last element is the most recent. */
    undoStack: readonly Command<GalleryState>[]
    /** Entries that were undone; the last element is the most recently undone. */
    redoStack: readonly Command<GalleryState>[]
    /** The current gallery, used to tell which redo entries can be applied right now. */
    gallery: GalleryState
    /** The entry a redo would run (see {@link History.nextRedo}), or `undefined` if nothing can be redone. */
    nextRedo: Command<GalleryState> | undefined
    /** The entry the latest redo re-applied, or `null` if the latest action was not a redo. */
    lastRedone: Command<GalleryState> | null
    /** Whether a background prune of the redo stack is in flight, in which case the stacks may still show stale entries. */
    pending: boolean
}

/** Tooltip for redo entries that Redo has to pass over. */
const SKIPPED_TITLE = "Cannot be applied to the current gallery, so Redo passes over it"

/**
 * The undo and redo stacks, newest first, annotated with what the next Undo/Redo will do.
 *
 * @remarks
 * - The top undo entry is marked "next undo".
 * - The undo entry that the latest redo re-applied is marked "redone".
 * - The redo entry that Redo would run is marked "next redo" (see {@link History.nextRedo}); redo entries that cannot be applied to the current gallery are greyed out and marked "skipped".
 * Every state has a text badge as well as a style, so it does not rely on colour alone.
 *
 * @param props - See {@link HistorySectionProps}.
 * @returns The history panel.
 */
export function HistorySection({undoStack, redoStack, gallery, nextRedo: next, lastRedone, pending}: HistorySectionProps) {
    const undoRows = [...undoStack].reverse()
    const redoRows = [...redoStack].reverse()
    return (
        <section className={pending ? 'history pending' : 'history'} aria-busy={pending}>
            <h2>History</h2>
            <div className="stacks">
                <section>
                    <h3>Undo stack (top first)</h3>
                    <ol>
                        {undoRows.map((e, i) => {
                            const redone = e === lastRedone
                            const classes = [i === 0 ? 'next' : '', redone ? 'redone' : ''].filter(Boolean).join(' ')
                            return (
                                // The redone row gets its own key so it remounts and plays its highlight animation.
                                <li key={redone ? `${i}-redone` : i} className={classes || undefined}>
                                    {String(e)}
                                    {i === 0 && <span className="badge">next undo</span>}
                                    {redone && <span className="badge">↻ redone</span>}
                                </li>
                            )
                        })}
                    </ol>
                    {undoRows.length === 0 && <p className="muted">empty</p>}
                </section>
                <section>
                    <h3>Redo stack (top first)</h3>
                    <ol>
                        {redoRows.map((e, i) => {
                            const skipped = !e.canDo(gallery)
                            return (
                                <li key={i} className={e === next ? 'next' : skipped ? 'skipped' : undefined} title={skipped ? SKIPPED_TITLE : undefined}>
                                    {String(e)}
                                    {e === next && <span className="badge">next redo</span>}
                                    {skipped && <span className="badge">skipped</span>}
                                </li>
                            )
                        })}
                    </ol>
                    {redoRows.length === 0 && <p className="muted">empty</p>}
                </section>
            </div>
        </section>
    )
}
