import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ContentService } from '../../core/content.service';
import { internalLink, isExternalLink } from '../../core/cms-link';
import { Top50PostData } from '../../models/post.model';
import { Top50Data } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';

const PREVIEW_LIMIT = 7;
const PAGE_SIZE = 15;

interface Stop {
    id: string | number;
    number: number;
    title: string;
    image?: string;
    description?: string;
    links: { label: string; href: string; internal: boolean }[];
    /** "artykuł · www · galeria" – the preview caption. */
    summary: string;
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
    imports: [NgTemplateOutlet, RouterLink, TrustedPipe],
    // Intro and descriptions are CMS HTML in [innerHTML] – see TitleAndText.
    host: { ngSkipHydration: 'true' },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Top50 implements OnInit {
    readonly component = input.required<Top50Data>();

    readonly preview = computed(() => this.component().variant === 'zapowiedź');
    readonly stops = signal<Stop[]>([]);
    private readonly visibleCount = signal(PAGE_SIZE);

    private readonly content = inject(ContentService);
    private readonly destroyRef = inject(DestroyRef);

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
        return this.stops().slice(0, limit ?? this.visibleCount());
    });

    readonly hasMore = computed(() => !this.limit() && this.stops().length > this.visibleCount());

    /** The photo of the preview: the first stop that has one. */
    readonly featured = computed(() => this.stops().find(stop => stop.image));

    ngOnInit(): void {
        this.content
            .posts<Top50PostData>('top50')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(posts =>
                this.stops.set(
                    posts
                        .map(post => {
                            const links = chips(post.data?.links);
                            return {
                                id: post.id,
                                number: Number(post.data?.number) || 0,
                                title: post.title ?? '',
                                image: post.data?.image || undefined,
                                description: post.data?.description || undefined,
                                links,
                                summary: links.map(link => link.label).join(' · ')
                            };
                        })
                        .sort((a, b) => a.number - b.number)
                )
            );
    }

    more(): void {
        this.visibleCount.update(count => count + PAGE_SIZE);
    }
}
