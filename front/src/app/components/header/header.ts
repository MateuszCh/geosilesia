import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    OnInit,
    inject,
    signal
} from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ResourceService } from '../../core/resource.service';
import { internalLink } from '../../core/cms-link';
import { NavItem, NavigationPost } from '../../models/post.model';

/** Odstęp na animację wysunięcia panelu bocznego (_aside-menu.scss). */
const SUBNAV_RESET_MS = 500;

@Component({
    selector: 'app-header',
    templateUrl: './header.html',
    imports: [RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Header implements OnInit {
    readonly nav = signal<NavItem[]>([]);
    readonly asideOpen = signal(false);
    readonly showSubNav = signal(false);
    readonly subnav = signal<NavItem['subnav']>([]);
    /** Indeks pozycji menu, nad którą stoi kursor; false = żadna. */
    readonly hoverNavItem = signal<number | false>(false);
    readonly currentPath = signal('/');

    protected readonly internalLink = internalLink;

    private readonly resource = inject(ResourceService);
    private readonly router = inject(Router);
    private readonly doc = inject(DOCUMENT);
    private readonly destroyRef = inject(DestroyRef);
    private subnavTimer: ReturnType<typeof setTimeout> | undefined;

    ngOnInit(): void {
        this.currentPath.set(this.pathOf(this.router.url));

        this.router.events
            .pipe(
                filter(event => event instanceof NavigationStart),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe(() => {
                this.toggleAsideNav(false);
                this.hoverNavItem.set(false);
            });

        // Aktywną pozycję liczymy dopiero po NavigationEnd: przy NavigationStart
        // router.url wskazuje jeszcze poprzednią stronę (router zatwierdza adres
        // po resolverach), a przy pierwszym wejściu – "/".
        this.router.events
            .pipe(
                filter(event => event instanceof NavigationEnd),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe(event =>
                this.currentPath.set(this.pathOf(event.urlAfterRedirects))
            );

        // Tu odwrotnie niż na innych ekranach: najpierw sieć, a IndexedDB dopiero gdy
        // zawiedzie. Nawigacja jest jedna dla całego serwisu i zmienia się rzadko,
        // więc nie ma po co migać starą wersją, zanim przyjdzie nowa.
        this.resource
            .loadPostsFromNetwork<NavigationPost['data']>('navigation')
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(posts => {
                if (posts.length) {
                    this.setNav(posts);
                    return;
                }
                if (this.resource.isOfflineAvailable()) {
                    void this.resource
                        .loadPostsFromCache<NavigationPost['data']>('navigation')
                        .then(cached => this.setNav(cached));
                }
            });

        this.destroyRef.onDestroy(() => {
            clearTimeout(this.subnavTimer);
            this.doc.body.classList.remove('aside-nav-open');
        });
    }

    private setNav(posts: NavigationPost[]): void {
        this.nav.set(posts[0]?.data?.nav ?? []);
    }

    private pathOf(url: string): string {
        const path = url.split('?')[0].split('#')[0];
        try {
            return decodeURIComponent(path);
        } catch {
            return path;
        }
    }

    /**
     * Pozycja jest aktywna dla własnego adresu i dla wszystkiego pod nim, żeby podstrona
     * galerii podświetlała pozycję „Galerie". Dla pozycji bez adresu decyduje podmenu.
     */
    isActive(link?: string, group?: NavItem['subnav']): boolean {
        const path = this.currentPath();
        if (link) {
            const target = internalLink(link);
            return target === path || path.startsWith(`${target}/`);
        }
        return !!group?.some(item => !!item.link && internalLink(item.link) === path);
    }

    toggleAsideNav(to?: boolean): void {
        const state = to === undefined ? !this.asideOpen() : to;
        this.doc.body.classList.toggle('aside-nav-open', state);
        this.asideOpen.set(state);
        if (!state) {
            // Podmenu chowamy dopiero po zjechaniu panelu – inaczej przeskoczyłoby
            // do pierwszego poziomu na oczach użytkownika.
            clearTimeout(this.subnavTimer);
            this.subnavTimer = setTimeout(
                () => this.showSubNav.set(false),
                SUBNAV_RESET_MS
            );
        }
    }

    openSubnav(item: NavItem): void {
        this.subnav.set(item.subnav ?? []);
        this.showSubNav.set(true);
    }
}
