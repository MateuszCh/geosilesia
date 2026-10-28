import { Signal, WritableSignal } from '@angular/core';
import { LiteratureData } from '../models/row.model';

/**
 * What the rows of a page take from the page around them: state shared with the header or
 * with another row. PageView provides it, so every row gets it – components nested in a
 * row (columns) too.
 */
export abstract class RowContext {
    /** Normalized path of the page; the gallery links its photos with it. */
    abstract readonly path: Signal<string>;
    /** The map is the page's main content (and its title the h1). */
    abstract readonly mapStandalone: Signal<boolean>;
    /** The dictionary's search query, shared with the field in the light header band. */
    abstract readonly dictionaryQuery: WritableSignal<string>;
    /** The light header band holds the dictionary's search field. */
    abstract readonly searchInHeader: Signal<boolean>;
    /** Literature that closes the dictionary's column instead of standing on its own. */
    abstract readonly dictionaryLiterature: Signal<{ data: LiteratureData } | undefined>;
    /** The author and dates closing the literature box; empty when they stand elsewhere. */
    abstract readonly literatureByline: Signal<string>;
    /** Tabs list their sections unless the section menu stands beside the text. */
    abstract readonly showToc: Signal<boolean>;
}
