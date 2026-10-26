import { ChangeDetectionStrategy, Component, DOCUMENT, computed, inject, input, model, signal } from '@angular/core';
import { DictionaryData, DictionaryItem } from '../../models/row.model';
import { ScrollService } from '../../core/scroll.service';
import { foldText } from '../../shared/fold-text';
import { DictionarySearch } from './dictionary-search';

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
    imports: [DictionarySearch],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Dictionary {
    readonly component = input.required<DictionaryData>();
    /** Two-way: the page header holds the field when the light band shows it. */
    readonly query = model('');
    readonly searchInHeader = input(false);
    readonly active = signal(-1);

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
