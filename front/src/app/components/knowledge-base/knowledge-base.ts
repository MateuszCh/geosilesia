import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ContentService } from '../../core/content.service';
import { internalLink } from '../../core/cms-link';
import { formatDate } from '../../core/dates';
import { KnowledgeSection, ResourcePost, ResourcePostData } from '../../models/post.model';
import { KnowledgeBaseData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { plural } from '../../shared/plural';

/** The seven sections, in their order, with the trail colour and the action of each. */
const SECTIONS: { name: KnowledgeSection; color: string; textColor: string; cta: string }[] = [
    { name: 'Do posłuchania', color: 'var(--trail-red)', textColor: 'var(--trail-red)', cta: 'Posłuchaj ↗' },
    { name: 'Do poczytania', color: 'var(--trail-blue)', textColor: 'var(--trail-blue)', cta: 'Czytaj ↗' },
    { name: 'Do pobrania', color: 'var(--trail-green)', textColor: 'var(--trail-green)', cta: 'Pobierz' },
    // Yellow is never text – the source label of this section is a dark ochre.
    { name: 'Do pooglądania', color: 'var(--trail-yellow)', textColor: '#8a6d00', cta: 'Oglądaj ↗' },
    { name: 'Animacje i prezentacje', color: 'var(--trail-black)', textColor: 'var(--ink)', cta: 'Otwórz ↗' },
    { name: 'Mapy online', color: 'var(--cat-teal)', textColor: 'var(--cat-teal)', cta: 'Otwórz mapę ↗' },
    { name: 'Wirtualne media', color: 'var(--cat-purple)', textColor: 'var(--cat-purple)', cta: 'Odwiedź ↗' }
];

const COLLAPSED = 8;

interface ResourceView {
    id: string | number;
    title: string;
    source?: string;
    note?: string;
    href: string;
}

/**
 * The knowledge base, read from `zasob` posts: every section with a section switcher, a
 * single section (the section pages), or – as "zapowiedź" – the list of sections.
 */
@Component({
    selector: 'app-knowledge-base',
    templateUrl: './knowledge-base.html',
    imports: [RouterLink, TrustedPipe],
    // Intro and notes are CMS HTML in [innerHTML] – see TitleAndText.
    host: { ngSkipHydration: 'true' },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class KnowledgeBase implements OnInit {
    readonly component = input.required<KnowledgeBaseData>();

    readonly loaded = signal(false);
    readonly expanded = signal(false);
    private readonly posts = signal<ResourcePost[]>([]);
    private readonly selected = signal<string | undefined>(undefined);
    protected readonly collapsedCount = COLLAPSED;

    private readonly content = inject(ContentService);
    private readonly route = inject(ActivatedRoute);
    private readonly destroyRef = inject(DestroyRef);

    readonly preview = computed(() => this.component().variant === 'zapowiedź');
    /** One section chosen in the CMS, or all of them with the switcher. */
    private readonly fixedSection = computed(() => {
        const section = this.component().section;
        return section && section !== 'wszystkie' ? section : undefined;
    });
    readonly showNav = computed(() => !this.fixedSection());
    readonly link = computed(() => internalLink(this.component().link) ?? '/');

    readonly sections = computed(() =>
        SECTIONS.map(section => {
            const posts = this.posts().filter(post => post.data?.section === section.name);
            const items: ResourceView[] = posts
                .sort(
                    (a, b) =>
                        (Number(a.data.position) || Infinity) - (Number(b.data.position) || Infinity) ||
                        (a.title ?? '').localeCompare(b.title ?? '', 'pl')
                )
                .map(post => ({
                    id: post.id,
                    title: post.title ?? '',
                    source: post.data.source,
                    note: post.data.note,
                    href: post.data.url || post.data.file || '#'
                }));
            const updated = formatDate(Math.max(0, ...posts.map(post => post.updated ?? post.created ?? 0)) || undefined);
            const count = items.length;
            return {
                ...section,
                items,
                meta: [`${count} ${plural(count, 'pozycja', 'pozycje', 'pozycji')}`, updated ? `aktualizacja ${updated}` : '']
                    .filter(Boolean)
                    .join(' · ')
            };
        })
    );

    readonly current = computed(() => {
        const name = this.fixedSection() ?? this.selected();
        return this.sections().find(section => section.name === name) ?? this.sections().at(0);
    });

    ngOnInit(): void {
        const wanted = this.route.snapshot.queryParamMap.get('dzial');
        if (wanted) this.selected.set(wanted);
        this.content
            .posts<ResourcePostData>('zasob')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(posts => {
                this.posts.set(posts);
                this.loaded.set(true);
            });
    }

    select(name: string): void {
        this.selected.set(name);
        this.expanded.set(false);
    }
}
