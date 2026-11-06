import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ParagraphClass, TextRow, TitleAndTextData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { HtmlDirective } from '../../shared/html.directive';

type ParagraphKind = 'quote' | 'lead' | 'bold' | 'plain';
type ListItem = NonNullable<TextRow['list']>[number];

/** The date an entry of a dated list starts with ("2026-10-22 …"). */
const LEADING_DATE = /^\s*(\d{4}-\d{2}-\d{2})/;
const dateOf = (item: ListItem): string => LEADING_DATE.exec(item.item ?? '')?.[1] ?? '';

/**
 * Newest date first. Frodo appends new entries at the end, so among entries of one day (and
 * among undated ones, which go last) the one added later comes first.
 */
function newestFirst(list: ListItem[]): ListItem[] {
    return [...list].reverse().sort((a, b) => {
        const [da, db] = [dateOf(a), dateOf(b)];
        if (!da || !db) return da ? -1 : db ? 1 : 0;
        return da < db ? 1 : da > db ? -1 : 0;
    });
}

@Component({
    selector: 'app-title-and-text',
    templateUrl: './title-and-text.html',
    // CMS HTML in <p [appHtml]>: if an editor puts a block element in it (<p>, <div>,
    // <ul>), the browser rearranges the server-sent DOM and hydration breaks. So the
    // component re-renders in the browser; the content is in the HTML for robots anyway.
    host: { ngSkipHydration: 'true' },
    imports: [TrustedPipe, HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TitleAndText {
    readonly component = input.required<TitleAndTextData>();

    /** "Kolejność list": as in the CMS, or dated entries newest first ("Istotne aktualizacje"). */
    listItems(row: TextRow): ListItem[] {
        const list = row.list ?? [];
        return this.component().list_order === 'od najnowszej daty' ? newestFirst(list) : list;
    }

    /** `paragraph_class` holds a choice in variant C and a CSS class on older pages. */
    kind(value: ParagraphClass | undefined): ParagraphKind {
        switch ((value ?? '').trim()) {
            case 'cytat':
                return 'quote';
            case 'wstęp':
                return 'lead';
            case 'pogrubiony':
            case 'fw-bold':
                return 'bold';
            default:
                return 'plain';
        }
    }
}
