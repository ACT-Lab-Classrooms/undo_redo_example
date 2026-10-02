import bruce from './assets/cats/bruce.jpg'
import kaliope from './assets/cats/kaliope.jpg'
import kizzy from './assets/cats/kizzy.jpg'
import polymnia from './assets/cats/polymnia.jpg'
import sarah from './assets/cats/sarah.jpg'
import sparrow from './assets/cats/sparrow.jpg'

/**
 * The cat photo catalogue.
 *
 * @packageDocumentation
 */

/** Unique identifier of a cat; matches the photo's file name in `assets/cats`. */
export type CatId = 'bruce' | 'kaliope' | 'kizzy' | 'polymnia' | 'sarah' | 'sparrow'

/** A cat that can be shown in the gallery. */
export interface Cat {
  /** Unique identifier. */
  id: CatId
  /** Display name. */
  name: string
  /** URL of the photo, as resolved by the bundler. */
  src: string
}

/** Every cat available to add to the gallery, in menu order. */
export const CATS: readonly Cat[] = [
  { id: 'bruce', name: 'Bruce', src: bruce },
  { id: 'kaliope', name: 'Kaliope', src: kaliope },
  { id: 'kizzy', name: 'Kizzy', src: kizzy },
  { id: 'polymnia', name: 'Polymnia', src: polymnia },
  { id: 'sarah', name: 'Sarah', src: sarah },
  { id: 'sparrow', name: 'Sparrow', src: sparrow },
]

/**
 * Looks up a cat in the catalogue.
 *
 * @param id - The identifier of the cat to find.
 * @returns The matching {@link Cat}. Every {@link CatId} has an entry in {@link CATS}, so this never returns `undefined`.
 */
export function catById(id: CatId): Cat {
  return CATS.find((c) => c.id === id)!
}
