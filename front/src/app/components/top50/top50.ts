import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    Injector,
    OnInit,
    afterNextRender,
    computed,
    inject,
    input,
    signal
} from '@angular/core';
import { NgTemplateOutlet, ViewportScroller } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ContentService } from '../../core/content.service';
import { internalLink, isExternalLink } from '../../core/cms-link';
import { Top50PostData } from '../../models/post.model';
import { Top50Data } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { HtmlDirective } from '../../shared/html.directive';

const PREVIEW_LIMIT = 7;
/** The full list opens with this many places; "Dalej: miejsca 16–50" shows the rest at once. */
const FIRST_STOPS = 15;

interface Stop {
    id: string | number;
    number: number;
    title: string;
    image?: string;
    description?: string;
    links: { label: string; href: string; internal: boolean }[];
}

/**
 * Source chips: the editor's own label, else the kind; repeated kinds are numbered
 * ("www 1", "www 2"), as in the old text of the TOP 50 page.
 */
function chips(links: Top50PostData['links']): Stop['links'] {
    const valid = (links ?? []).filter(link => link?.url);
    const totals = new Map<string, number>();
    valid.forEach(link => totals.set(link!.kind ?? 'inne', (totals.get(link!.kind ?? 'inne') ?? 0) + 1));
    const seen = new Map<string, number>();
    return valid.map(link => {
        const kind = link!.kind || 'inne';
        seen.set(kind, (seen.get(kind) ?? 0) + 1);
        const label = link!.label || (totals.get(kind)! > 1 ? `${kind} ${seen.get(kind)}` : kind);
        const url = link!.url!;
        const internal = !isExternalLink(url);
        return { label, href: internal ? internalLink(url)! : url, internal };
    });
}

/** The TOP 50 route: the full list with photos and sources, or the home page preview. */
@Component({
    selector: 'app-top50',
    templateUrl: './top50.html',
    imports: [NgTemplateOutlet, RouterLink, TrustedPipe, HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Top50 implements OnInit {
    readonly component = input.required<Top50Data>();

    readonly preview = computed(() => this.component().variant === 'zapowiedź');
    readonly stops = signal<Stop[]>([]);
    private readonly expanded = signal(false);
    /** The place pointed at in the preview list (mouse or keyboard); stays when the pointer leaves. */
    private readonly pointed = signal<Stop | undefined>(undefined);
    private preloaded = false;

    private readonly content = inject(ContentService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly doc = inject(DOCUMENT);
    private readonly injector = inject(Injector);
    private readonly route = inject(ActivatedRoute);
    private readonly scroller = inject(ViewportScroller);

    /** The link may carry a query ("/mapa-atrakcji?top50=1"); the router needs it apart. */
    private readonly parsedLink = computed(() => {
        const link = internalLink(this.component().link);
        if (!link) return undefined;
        const [path, query = ''] = link.split('?');
        return { path, params: Object.fromEntries(new URLSearchParams(query)) };
    });
    readonly link = computed(() => this.parsedLink()?.path);
    readonly linkParams = computed(() => this.parsedLink()?.params ?? {});

    private readonly limit = computed(() => {
        const limit = Number(this.component().limit);
        return limit > 0 ? limit : this.preview() ? PREVIEW_LIMIT : undefined;
    });

    readonly shown = computed(() => {
        const limit = this.limit();
        return this.stops().slice(0, limit ?? (this.expanded() ? undefined : FIRST_STOPS));
    });

    readonly hasMore = computed(() => !this.limit() && !this.expanded() && this.stops().length > FIRST_STOPS);

    /** The place the preview shows: the one pointed at in the list, else the first with a photo. */
    readonly featured = computed(
        () => this.pointed() ?? this.stops().find(stop => stop.image) ?? this.stops()[0]
    );

    ngOnInit(): void {
        this.content
            .posts<Top50PostData>('top50')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(posts => {
                this.stops.set(
                    posts
                        .map(post => ({
                            id: post.id,
                            number: Number(post.data?.number) || 0,
                            title: post.title ?? '',
                            image: post.data?.image || undefined,
                            description: post.data?.description || undefined,
                            links: chips(post.data?.links)
                        }))
                        .sort((a, b) => a.number - b.number)
                );
                this.revealTarget();
            });
    }

    point(stop: Stop): void {
        this.pointed.set(stop);
    }

    /**
     * Loads the photos of the listed places once the pointer reaches the list, so that the
     * photo changes together with the caption.
     */
    preload(): void {
        if (this.preloaded) return;
        this.preloaded = true;
        this.shown().forEach(stop => {
            if (stop.image) new Image().src = stop.image;
        });
    }

    /**
     * A place of the home page preview opens the list at that place ("#top50-12"), past the
     * first 15 too. The router scrolls to it when the list is already there; this covers the
     * list that arrives later.
     */
    private revealTarget(): void {
        const target = this.route.snapshot.fragment;
        const number = Number(/^top50-(\d+)$/.exec(target ?? '')?.[1]);
        if (this.preview() || !number) return;
        const index = this.stops().findIndex(stop => stop.number === number);
        if (index === -1) return;
        if (index >= FIRST_STOPS) this.expanded.set(true);
        afterNextRender(() => this.scroller.scrollToAnchor(target!), { injector: this.injector });
    }

    /**
     * Shows every remaining place. The button disappears with it, so the focus moves to the
     * first place it revealed instead of falling back to the page.
     */
    more(): void {
        const next = this.stops()[FIRST_STOPS];
        this.expanded.set(true);
        if (!next) return;
        afterNextRender(() => this.doc.getElementById(this.stopId(next))?.focus(), { injector: this.injector });
    }

    stopId(stop: Stop): string {
        return `top50-${stop.number}`;
    }
}
