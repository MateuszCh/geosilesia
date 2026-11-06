import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ContentService } from '../../core/content.service';
import { internalLink } from '../../core/cms-link';
import { NavigationService } from '../../core/navigation.service';
import { formatDate } from '../../core/dates';
import { KnowledgeSection, ResourcePost, ResourcePostData } from '../../models/post.model';
import { KnowledgeBaseData } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { plural } from '../../shared/plural';
import { HtmlDirective } from '../../shared/html.directive';

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
 * The knowledge base, read from `zasob` posts. The full variant lists the sections beside
 * the open one; on a section page (a section chosen in the CMS) the list links to the other
 * section pages, found in the navigation by the section's name, so each section has an
 * address of its own. "zapowiedź" shows only the list of sections.
 */
@Component({
    selector: 'app-knowledge-base',
    templateUrl: './knowledge-base.html',
    imports: [NgTemplateOutlet, RouterLink, TrustedPipe, HtmlDirective],
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
    private readonly navigation = inject(NavigationService);
    private readonly route = inject(ActivatedRoute);
    private readonly destroyRef = inject(DestroyRef);

    readonly preview = computed(() => this.component().variant === 'zapowiedź');
    /** The section chosen in the CMS (a section page), or none ("wszystkie"). */
    private readonly fixedSection = computed(() => {
        const section = this.component().section;
        return section && section !== 'wszystkie' ? section : undefined;
    });
    readonly link = computed(() => internalLink(this.component().link) ?? '/');

    /** Section name → its page, from the navigation's subpages of the same name. */
    private readonly sectionPages = computed(() => {
        const pages = new Map<string, string>();
        this.navigation.items().forEach(item =>
            item.subnav?.forEach(sub => {
                const link = internalLink(sub.link);
                if (sub.subtitle && link && SECTIONS.some(section => section.name === sub.subtitle?.trim())) {
                    pages.set(sub.subtitle.trim(), link);
                }
            })
        );
        return pages;
    });

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
                page: this.sectionPages().get(section.name),
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
