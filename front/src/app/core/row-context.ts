import { Signal, WritableSignal } from '@angular/core';

/**
 * What the rows of a page take from the page around them: state shared with the header or
 * values of the page. PageView provides it, so every row gets it – components nested in a
 * row (columns, the dictionary, TOP 50) too.
 */
export abstract class RowContext {
    /** Normalized path of the page; the gallery links its photos with it. */
    abstract readonly path: Signal<string>;
    /** The dictionary's search query, shared with the field in the page header. */
    abstract readonly dictionaryQuery: WritableSignal<string>;
    /** The page header holds the search field of the dictionary that asks for it. */
    abstract readonly searchInHeader: Signal<boolean>;
    /** The author and dates when the page puts them in the literature box ("Autor i daty"). */
    abstract readonly literatureByline: Signal<string>;
}
