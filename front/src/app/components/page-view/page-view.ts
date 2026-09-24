import {
    ChangeDetectionStrategy,
    Component,
    effect,
    inject,
    input,
    signal,
    untracked
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { Page } from '../../models/page.model';
import { ResourceService } from '../../core/resource.service';
import { SeoService } from '../../core/seo.service';
import { pageKeyFromUrl } from '../../core/page-key';
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
import { SearchMap } from '../search-map/search-map';
import { Tabs } from '../tabs/tabs';
import { TitleAndText } from '../title-and-text/title-and-text';

@Component({
    selector: 'app-page-view',
    templateUrl: './page-view.html',
    imports: [
        RouterLink,
        Dictionary,
        Footnotes,
        Gallery,
        GalleryList,
        GeositesLogos,
        Heading,
        HomepageBanner,
        Literature,
        MarkerCategoryList,
        News,
        SearchMap,
        Tabs,
        TitleAndText
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageView {
    /** Wynik resolvera, wiązany przez withComponentInputBinding(). */
    readonly page = input<Page | undefined>();

    readonly displayed = signal<Page | undefined>(undefined);
    readonly loaded = signal(false);

    /** Zmienia treść komunikatu 404: tylko w trybie offline brak strony może
        oznaczać, że po prostu nie zdążyła trafić do cache'u. */
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
        // Komponent nie jest odtwarzany między podstronami (jedna trasa "**"), więc
        // spóźniona odpowiedź dla poprzedniego adresu podmieniłaby treść i meta
        // bieżącego. Zapytanie poprzedniej strony musi zostać anulowane.
        this.pending?.unsubscribe();
        this.pending = undefined;

        this.displayed.set(resolved);
        this.loaded.set(false);

        // Resolver oddał treść z IndexedDB, żeby strona pojawiła się natychmiast – teraz
        // dociągamy wersję z sieci. Bez trybu offline resolver już poszedł do sieci
        // i drugie zapytanie byłoby zbędne.
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

        // O 404 decyduje istnienie strony, a nie jej zawartość – tak samo jak na serwerze.
        // Pusta strona z CMS-a nadal ma swój adres i tytuł.
        const current = this.displayed();
        if (current?.pageUrl) {
            this.seo.applyForPage(current);
        } else {
            this.seo.applyNotFound(this.router.url);
        }
    }
}
