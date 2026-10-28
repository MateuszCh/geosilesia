import {
    ChangeDetectionStrategy,
    Component,
    PLATFORM_ID,
    computed,
    effect,
    inject,
    input,
    signal,
    untracked
} from '@angular/core';
import { NgTemplateOutlet, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { Page } from '../../models/page.model';
import { ResourceService } from '../../core/resource.service';
import { SeoService } from '../../core/seo.service';
import { pageKeyFromUrl } from '../../core/page-key';
import { NavigationService } from '../../core/navigation.service';
import { PageLayout, layoutPage } from '../../core/page-layout';
import * as seoMeta from '../../../../../shared/seo-meta';
import { PageHero, bylineText } from '../page-hero/page-hero';
import { SectionBar } from '../section-bar/section-bar';
import { DictionarySearch } from '../dictionary/dictionary-search';
import { RowView } from '../row/row';
import { RowContext } from '../../core/row-context';

@Component({
    selector: 'app-page-view',
    templateUrl: './page-view.html',
    imports: [
        NgTemplateOutlet,
        RouterLink,
        PageHero,
        SectionBar,
        DictionarySearch,
        RowView
    ],
    // The rows read the page's shared state through RowContext – nested ones too.
    providers: [{ provide: RowContext, useExisting: PageView }],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageView implements RowContext {
    /** Resolver result, bound via withComponentInputBinding(). */
    readonly page = input<Page | undefined>();

    readonly displayed = signal<Page | undefined>(undefined);
    readonly loaded = signal(false);

    protected readonly navigation = inject(NavigationService);

    /** Normalized path of the displayed page – "/budowa-geologiczna-wojewodztwa-slaskiego". */
    readonly path = computed(() => seoMeta.normalizePath(this.displayed()?.pageUrl ?? ''));

    readonly layout = computed<PageLayout>(() => {
        const page = this.displayed();
        return page?.pageUrl
            ? layoutPage(page)
            : { kind: 'content', rows: [], side: [], wide: false };
    });

    /** The dictionary's search; the light header band may hold the field. */
    readonly dictionaryQuery = signal('');

    /** The light header band holds the dictionary's search field. */
    readonly searchInHeader = computed(() => this.layout().header?.searchCount !== undefined);
    /** The map is the page's main content (and its title the h1) unless the home banner is above it. */
    readonly mapStandalone = computed(
        () => !this.layout().rows.some(row => row.type === 'homepage_banner')
    );
    readonly crumbs = computed(() => this.navigation.trail(this.path()));
    readonly section = computed(() => this.navigation.section(this.path()));
    readonly next = computed(() => this.navigation.next(this.path()));
    /** The knowledge base lists its sections itself – its pages get no section bar or "Dalej". */
    readonly listsSections = computed(() =>
        this.layout().rows.some(row => row.type === 'knowledge_base' && row.data?.variant !== 'zapowiedź')
    );
    /** The section's pages, wherever a page shows them. */
    readonly sectionBar = computed(() =>
        this.layout().kind === 'content' && !this.listsSections() ? this.section() : undefined
    );
    /**
     * Where the section's pages show, as in the mockups: in a light header band above the
     * title (the dictionary pages), as a menu beside the text of a page that has nothing
     * else there (Położenie, Rzeźba terenu), and not at all beside a page's own side column
     * (Budowa geologiczna, Skarby natury).
     */
    readonly sideMenu = computed(() => {
        const { header, side } = this.layout();
        return header?.style !== 'light' && side.length === 0 ? this.sectionBar() : undefined;
    });
    /** Tabs list their sections themselves unless the section menu stands beside the text. */
    readonly showToc = computed(() => !this.sideMenu());
    /** "Dalej w dziale" closes the side column of an article with tabs (Budowa geologiczna). */
    readonly sideNext = computed(() => {
        const { header, side, rows } = this.layout();
        const article = header?.style !== 'light' && side.length > 0 && rows.some(row => row.type === 'tabs');
        return article ? this.next() : undefined;
    });
    /** The author and dates of a page whose header band does not show them. */
    readonly bylineBelow = computed(() =>
        this.layout().header?.bylineBelow ? bylineText(this.layout().byline) : ''
    );
    /** Literature right after the dictionary closes the column of its terms, as in the mockup. */
    readonly dictionaryLiterature = computed(() => {
        const rows = this.layout().rows;
        const next = rows[rows.findIndex(row => row.type === 'dictionary') + 1];
        return rows.some(row => row.type === 'dictionary') && next?.type === 'literature' ? next : undefined;
    });
    /** The byline closes the literature box (Słowa kluczowe) or else the side column (Geoparki). */
    readonly literatureByline = computed(() =>
        this.layout().rows.some(row => row.type === 'literature') ? this.bylineBelow() : ''
    );
    readonly sideByline = computed(() => (this.literatureByline() ? '' : this.bylineBelow()));
    /** The side column: side rows, the section menu and "Dalej w dziale". */
    readonly hasSide = computed(() => this.layout().side.length > 0 || !!this.sideMenu() || !!this.sideNext());
    readonly top50Link = computed(() => {
        const item = this.navigation.items().find(entry => /top\s*50/i.test(entry.title ?? ''));
        return item ? this.navigation.sectionLink(item) : undefined;
    });
    /** Only for the 404 page, which is never server-rendered. */
    readonly offline = signal(
        isPlatformBrowser(inject(PLATFORM_ID)) && globalThis.navigator?.onLine === false
    );

    /** Changes the 404 message: only in offline mode can a missing page mean
        that it simply has not made it into the cache yet. */
    readonly offlineAvailable = inject(ResourceService).isOfflineAvailable();

    private readonly resource = inject(ResourceService);
    private readonly seo = inject(SeoService);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);
    private pending: Subscription | undefined;

    constructor() {
        effect(() => {
            const resolved = this.page();
            untracked(() => this.load(resolved));
        });
    }

    private load(resolved: Page | undefined): void {
        // The component is not recreated between pages (a single "**" route), so a late
        // response for the previous address would replace the content and meta of the
        // current one. The previous page's request has to be cancelled.
        this.pending?.unsubscribe();
        this.pending = undefined;

        this.displayed.set(resolved);
        this.loaded.set(false);
        this.dictionaryQuery.set('');

        // The resolver returned content from IndexedDB so the page appears immediately –
        // now the network version is fetched. Without offline mode the resolver already
        // went to the network and a second request would be redundant.
        if (!this.resource.isOfflineAvailable()) {
            this.onLoad(resolved);
            return;
        }
        this.pending = this.resource
            .loadPageFromNetwork(pageKeyFromUrl(this.router.url))
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(fresh => this.onLoad(fresh ?? resolved));
    }

    private onLoad(page: Page | undefined): void {
        if (page?.pageUrl) {
            this.displayed.set(page);
        }
        this.loaded.set(true);

        // A 404 depends on whether the page exists, not on its content – same as on the
        // server. An empty CMS page still has its address and title.
        const current = this.displayed();
        if (current?.pageUrl) {
            this.seo.applyForPage(current);
        } else {
            this.seo.applyNotFound(this.router.url);
        }
    }
}
