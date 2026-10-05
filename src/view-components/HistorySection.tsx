import {useId} from "react";
import type {History} from "../command-history/History.ts";
import type {GalleryState} from "../gallery-commands/GalleryState.ts";

/** Props for {@link HistorySection}. */
interface HistorySectionProps {
    /** The complete history: current gallery plus undo and redo stacks. */
    history: History<GalleryState>
}

/**
 * The undo and redo stacks, newest first, annotated with what the next Undo/Redo will do.
 *
 * @remarks
 * The top undo entry is marked "next undo" and the top redo entry "next redo". Each has a text badge as well as a style, so it does not rely on colour alone.
 *
 * @param props - See {@link HistorySectionProps}.
 * @returns The history panel.
 */
export function HistorySection({history}: HistorySectionProps) {
    const headingId = useId()
    const undoId = useId()
    const redoId = useId()
    const undoRows = [...history.undoStack].reverse()
    const redoRows = [...history.redoStack].reverse()
    return (
        <section className="history" aria-labelledby={headingId}>
            <h2 id={headingId}>History</h2>
            <div className="stacks">
                <section aria-labelledby={undoId}>
                    <h3 id={undoId}>Undo stack (top first)</h3>
                    <ol>
                        {undoRows.map((e, i) => (
                            <li key={i} className={i === 0 ? 'next' : undefined}>
                                {String(e)}
                                {i === 0 && <span className="badge">next undo</span>}
                            </li>
                        ))}
                    </ol>
                    {undoRows.length === 0 && <p className="muted">empty</p>}
                </section>
                <section aria-labelledby={redoId}>
                    <h3 id={redoId}>Redo stack (top first)</h3>
                    <ol>
                        {redoRows.map((e, i) => (
                            <li key={i} className={i === 0 ? 'next' : undefined}>
                                {String(e)}
                                {i === 0 && <span className="badge">next redo</span>}
                            </li>
                        ))}
                    </ol>
                    {redoRows.length === 0 && <p className="muted">empty</p>}
                </section>
            </div>
        </section>
    )
}
