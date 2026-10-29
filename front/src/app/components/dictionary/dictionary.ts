import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    computed,
    forwardRef,
    inject,
    input,
    model,
    signal
} from '@angular/core';
import { DictionaryData, DictionaryItem, Row } from '../../models/row.model';
import { ScrollService } from '../../core/scroll.service';
import { foldText } from '../../shared/fold-text';
import { DictionarySearch } from './dictionary-search';
import { RowView } from '../row/row';

/** Trail colours of the term marks, in turn. */
const MARK_COLORS = [
    'var(--trail-red)',
    'var(--trail-blue)',
    'var(--trail-green)',
    'var(--trail-yellow)',
    'var(--trail-black)'
];

/** "Geopark (ang. geopark)" – the foreign term written in the title on older pages. */
const FOREIGN_IN_TITLE = /\s*\(((?:ang|niem|łac|fr)\.[^)]*)\)\s*$/i;

interface TermView {
    id: string;
    index: number;
    term: string;
    foreign: string;
    color: string;
    rows: NonNullable<DictionaryItem['rows']>;
    searchText: string;
}

/** Splits the term from its foreign equivalent: the variant C field first, the title as a fallback. */
export function splitTerm(item: DictionaryItem): { term: string; foreign: string } {
    const title = item.title?.trim() ?? '';
    const match = FOREIGN_IN_TITLE.exec(title);
    const term = match ? title.slice(0, match.index).trim() : title;
    const own = item.title_en?.trim();
    if (own) return { term, foreign: /^(ang|niem|łac|fr)\./i.test(own) ? own : `ang. ${own}` };
    return { term, foreign: match?.[1].trim() ?? '' };
}

@Component({
    selector: 'app-dictionary',
    templateUrl: './dictionary.html',
    // RowView draws the component below the terms and itself imports this one: forwardRef breaks the cycle.
    imports: [DictionarySearch, forwardRef(() => RowView)],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Dictionary {
    readonly component = input.required<DictionaryData>();
    /** Two-way: shared with the page header when it holds the field. */
    readonly query = model('');
    /** The page header holds the search field of a dictionary that asks for it. */
    readonly headerSearch = input(false);
    readonly active = signal(-1);

    /** "Wyszukiwarka w nagłówku strony": the field is in the page header, not above the terms. */
    readonly searchInHeader = computed(() => !!this.component().search_in_header && this.headerSearch());

    /** The component under the terms, in their column ("Pod listą pojęć"): the literature, as in the mockup. */
    readonly below = computed<Row | undefined>(() => {
        const below = this.component().below;
        return below?.type ? below : undefined;
    });

    private readonly doc = inject(DOCUMENT);
    private readonly scroll = inject(ScrollService);

    readonly terms = computed<TermView[]>(() =>
        (this.component().items ?? []).map((item, index) => {
            const { term, foreign } = splitTerm(item);
            const rows = item.rows ?? [];
            return {
                id: `haslo-${index + 1}`,
                index,
                term,
                foreign,
                color: MARK_COLORS[index % MARK_COLORS.length],
                rows,
                searchText: foldText(
                    [term, foreign, ...rows.map(row => row.text ?? ''), ...rows.flatMap(row => (row.list_item ?? []).map(entry => entry.text ?? ''))].join(' ')
                )
            };
        })
    );

    readonly shown = computed(() => {
        const query = foldText(this.query().trim());
        return query ? this.terms().filter(term => term.searchText.includes(query)) : this.terms();
    });

    pick(event: Event, index: number): void {
        event.preventDefault();
        this.query.set('');
        this.active.set(index);
        this.scroll.scrollToElement(this.doc.getElementById(this.terms()[index].id));
    }

    capitalize(text: string): string {
        return text.charAt(0).toLocaleUpperCase('pl') + text.slice(1);
    }
}
