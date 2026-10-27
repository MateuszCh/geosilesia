import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    OnInit,
    computed,
    inject,
    input,
    signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ContentService } from '../../core/content.service';
import { ResourceService } from '../../core/resource.service';
import { internalLink } from '../../core/cms-link';
import { MONTHS_SHORT, dateParts, toDate } from '../../core/dates';
import { EventPost } from '../../models/post.model';
import { NewsData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { plural } from '../../shared/plural';
import { HtmlDirective } from '../../shared/html.directive';

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_PREVIEW = 3;
/** The CMS default label of an event link – variant C shows "Szczegóły" instead. */
const GENERIC_LINK_TEXT = /^link zewn/i;
const MONTHS_GENITIVE =
    'stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia';
/** The date at the start of the older `date_and_place` values: "29 września 2023, Jaworzno". */
const DATE_PREFIX = new RegExp(
    `^[\\s\\d.\\-–]*(?:(?:${MONTHS_GENITIVE})\\s*(?:\\d{4})?\\s*(?:r\\.)?)?[\\s,;:–-]*`,
    'i'
);

interface EventView {
    id: string | number;
    title: string;
    day?: string;
    month?: string;
    year?: number;
    /** dd.mm for the home page preview. */
    short: string;
    place: string;
    lead: string;
    paragraphs: string[];
    links: { href: string; label: string }[];
    time: number;
}

/** Year filter: one of the two latest years, or everything older; 'all' until events load. */
type YearFilter = number | 'older' | 'all';

/** Place of an event: the variant C field, else what follows the date in `date_and_place`. */
function placeOf(event: EventPost): string {
    if (event.data?.place) return event.data.place;
    const rest = (event.data?.date_and_place ?? '').replace(DATE_PREFIX, '').trim();
    return /\p{L}/u.test(rest) ? rest : '';
}

function toView(event: EventPost): EventView {
    const when = event.data?.event_date || event.data?.date_of_publication;
    const parts = dateParts(when);
    const paragraphs = (event.data?.paragraphs ?? [])
        .map(paragraph => paragraph?.item?.trim() ?? '')
        .filter(Boolean);
    return {
        id: event.id,
        title: event.title ?? '',
        day: parts ? String(parts.day).padStart(2, '0') : undefined,
        month: parts ? MONTHS_SHORT[parts.month - 1] : undefined,
        year: parts?.year,
        short: parts ? `${String(parts.day).padStart(2, '0')}.${String(parts.month).padStart(2, '0')}` : '',
        place: placeOf(event),
        lead: paragraphs[0] ?? '',
        paragraphs,
        links: (event.data?.links ?? [])
            .filter(link => !!link?.link)
            .map(link => ({
                href: link!.link!,
                label: link!.text && !GENERIC_LINK_TEXT.test(link!.text) ? link!.text : 'Szczegóły'
            })),
        time: toDate(event.data?.date_of_publication)?.getTime() ?? event.created ?? 0
    };
}

/** Events with a publication date in the future are hidden; the rest newest first. */
function publishedViews(events: EventPost[]): EventView[] {
    const now = Date.now();
    return events
        .filter(event => {
            const publication = toDate(event.data?.date_of_publication);
            return !!publication && publication.getTime() < now;
        })
        .map(toView)
        .sort((a, b) => b.time - a.time);
}

/**
 * Events: the full archive as an accordion with a year filter and pages, or – as
 * "zapowiedź" on the home page – the latest few.
 */
@Component({
    selector: 'app-news',
    templateUrl: './news.html',
    imports: [RouterLink, TrustedPipe, HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class News implements OnInit {
    readonly component = input.required<NewsData>();

    protected readonly internalLink = internalLink;

    readonly events = signal<EventView[]>([]);
    readonly loaded = signal(false);
    readonly openId = signal<string | number | undefined>(undefined);
    readonly selectedYear = signal<YearFilter>('all');
    readonly currentPage = signal(1);

    readonly preview = computed(() => this.component().variant === 'zapowiedź');

    private readonly limit = computed(() => {
        const limit = Number(this.component().limit);
        if (limit > 0) return limit;
        return this.preview() ? DEFAULT_PREVIEW : DEFAULT_PAGE_SIZE;
    });

    readonly years = computed(() => {
        const years = [...new Set(this.events().map(event => event.year).filter((y): y is number => !!y))].sort(
            (a, b) => b - a
        );
        const shown = years.slice(0, 2).map(year => ({ value: year as YearFilter, label: String(year) }));
        return years.length > 2
            ? [...shown, { value: 'older' as YearFilter, label: 'Starsze' }]
            : shown;
    });

    private readonly filtered = computed(() => {
        const year = this.selectedYear();
        const latest = this.years().slice(0, 2).map(entry => entry.value);
        return this.events().filter(event => {
            if (year === 'all') return true;
            if (year === 'older') return !!event.year && !latest.includes(event.year);
            return event.year === year;
        });
    });

    readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.limit())));

    readonly visible = computed(() => {
        if (this.preview()) return this.events().slice(0, this.limit());
        const start = (this.currentPage() - 1) * this.limit();
        return this.filtered().slice(start, start + this.limit());
    });

    /** Page numbers with 0 for a gap: 1 2 3 … 9. */
    readonly pages = computed(() => {
        const count = this.pageCount();
        const current = this.currentPage();
        const wanted = new Set([1, count, current - 1, current, current + 1].filter(page => page >= 1 && page <= count));
        const sorted = [...wanted].sort((a, b) => a - b);
        const result: number[] = [];
        sorted.forEach((page, index) => {
            if (index && page - sorted[index - 1] > 1) result.push(0);
            result.push(page);
        });
        return result;
    });

    readonly countLabel = computed(() => {
        const count = this.events().length;
        return count ? `${count} ${plural(count, 'wpis', 'wpisy', 'wpisów')} w archiwum` : '';
    });

    private readonly resource = inject(ResourceService);
    private readonly content = inject(ContentService);
    private readonly destroyRef = inject(DestroyRef);
    /** Network data takes precedence – once it has arrived, the IndexedDB result will not overwrite it. */
    private loadedFromNetwork = false;

    ngOnInit(): void {
        if (this.preview()) {
            // Only the few shown travel in the HTML, not the whole archive.
            const limit = this.limit();
            this.content
                .summary(`latest-events:${limit}`, () =>
                    this.content
                        .posts<EventPost['data']>('wydarzenie', false)
                        .pipe(map(posts => publishedViews(posts).slice(0, limit)))
                )
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(views => {
                    this.events.set(views);
                    this.loaded.set(true);
                });
            return;
        }
        if (this.resource.isOfflineAvailable()) {
            void this.resource
                .loadPostsFromCache<EventPost['data']>('wydarzenie')
                .then(cached => {
                    if (!this.loadedFromNetwork && cached.length) {
                        this.setEvents(cached);
                    }
                });
        }
        this.resource
            .loadPostsFromNetwork<EventPost['data']>('wydarzenie')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(posts => {
                this.loaded.set(true);
                if (posts.length) {
                    this.loadedFromNetwork = true;
                    this.setEvents(posts);
                }
            });
    }

    toggle(id: string | number): void {
        this.openId.update(open => (open === id ? undefined : id));
    }

    selectYear(year: YearFilter): void {
        this.selectedYear.set(year);
        this.currentPage.set(1);
    }

    goToPage(page: number): void {
        this.currentPage.set(page);
    }

    private setEvents(events: EventPost[]): void {
        const views = publishedViews(events);
        this.events.set(views);
        this.loaded.set(true);
        // The list opens on the latest year, as in the mockup.
        if (this.selectedYear() === 'all' && this.years().length > 1) {
            this.selectedYear.set(this.years()[0].value);
        }
        // The newest event starts open, as in the mockup.
        if (this.openId() === undefined) this.openId.set(views[0]?.id);
    }
}
