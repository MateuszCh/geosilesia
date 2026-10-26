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
import { PageLayout, groupRows, layoutPage } from '../../core/page-layout';
import * as seoMeta from '../../../../../shared/seo-meta';
import { PageHero, bylineText } from '../page-hero/page-hero';
import { SectionBar } from '../section-bar/section-bar';
import { DictionarySearch } from '../dictionary/dictionary-search';
import { Dictionary } from '../dictionary/dictionary';
import { Footnotes } from '../footnotes/footnotes';
import { Gallery } from '../gallery/gallery';
import { GalleryList } from '../gallery-list/gallery-list';
import { GeositesLogos } from '../geosites-logos/geosites-logos';
import { Heading } from '../heading/heading';
import { HomepageBanner } from '../homepage-banner/homepage-banner';
import { Literature } from '../literature/literature';
import { MarkerCategoryList } from '../marker-category-list/marker-category-list';
import { News } from '../news/news';
import { Notice } from '../notice/notice';
import { MapSearch } from '../map-search/map-search';
import { Facts } from '../facts/facts';
import { CategoryGrid } from '../category-grid/category-grid';
import { Top50 } from '../top50/top50';
import { LinkCards } from '../link-cards/link-cards';
import { Photos } from '../photos/photos';
import { Timeline } from '../timeline/timeline';
import { NumberedList } from '../numbered-list/numbered-list';
import { KnowledgeBase } from '../knowledge-base/knowledge-base';
import { Contact } from '../contact/contact';
import { SearchMap } from '../search-map/search-map';
import { Tabs } from '../tabs/tabs';
import { TitleAndText } from '../title-and-text/title-and-text';

@Component({
    selector: 'app-page-view',
    templateUrl: './page-view.html',
    imports: [
        NgTemplateOutlet,
        RouterLink,
        PageHero,
        SectionBar,
        Dictionary,
        DictionarySearch,
        Footnotes,
        Gallery,
        GalleryList,
        GeositesLogos,
        Heading,
        HomepageBanner,
        Literature,
        MarkerCategoryList,
        News,
        Notice,
        MapSearch,
        Facts,
        CategoryGrid,
        Top50,
        LinkCards,
        Photos,
        Timeline,
        NumberedList,
        KnowledgeBase,
        Contact,
        SearchMap,
        Tabs,
        TitleAndText
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageView {
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

    /** Rows of the home page and albums; the events and knowledge base previews share a line. */
    readonly groups = computed(() => groupRows(this.layout().rows));
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
    /**
     * Every page of a section links to all of the section's pages in a bar under its header,
     * as in the mockup – the same on article pages and on pages with full-width rows.
     */
    readonly sectionBar = computed(() =>
        this.layout().kind === 'content' && !this.listsSections() ? this.section() : undefined
    );
    /** Inside a light header band the section bar stands above the title, as in the mockups. */
    readonly mainSectionBar = computed(() =>
        this.layout().header?.style === 'light' ? undefined : this.sectionBar()
    );
    /**
     * "Dalej w dziale" stands beside the text on article pages (tabs) and on pages that
     * already have a side column, as in the mockup of an article; elsewhere under the text.
     */
    readonly sideNext = computed(() => {
        const { side, rows } = this.layout();
        const beside = side.length > 0 || rows.some(row => row.type === 'tabs');
        return beside && !this.listsSections() ? this.next() : undefined;
    });
    readonly mainNext = computed(() => (!this.sideNext() && !this.listsSections() ? this.next() : undefined));
    /** The author and dates of a page whose header band does not show them. */
    readonly bylineBelow = computed(() =>
        this.layout().header?.bylineBelow ? bylineText(this.layout().byline) : ''
    );
    /** The side column: link cards set to "lista boczna", the databases and "Dalej w dziale". */
    readonly hasSide = computed(() => this.layout().side.length > 0 || !!this.sideNext());
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
