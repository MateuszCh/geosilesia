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
import { NavigationService } from '../../core/navigation.service';
import { NavItem, NavSubItem } from '../../models/post.model';
import { internalLink } from '../../core/cms-link';

@Component({
    selector: 'app-header',
    templateUrl: './header.html',
    imports: [RouterLink],
    host: {
        '(document:keydown.escape)': 'onEscape()'
    },
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Header implements OnInit {
    protected readonly navigation = inject(NavigationService);
    protected readonly internalLink = internalLink;
    /** Trail colours of the subpage marks in the mobile menu, in turn. */
    protected readonly markColors = [
        'var(--trail-red)',
        'var(--trail-blue)',
        'var(--trail-green)',
        'var(--trail-yellow)',
        'var(--trail-black)'
    ];

    readonly menuOpen = signal(false);
    /** Index of the desktop section whose subpage list is open from its button; -1 = none. */
    readonly openNav = signal(-1);
    /**
     * After a click on a section or subpage link the pointer still hovers the list on the
     * new page; hover stays off until the pointer leaves the navigation.
     */
    readonly hoverOff = signal(false);
    /** Index of the expanded section in the mobile menu; -1 = none. */
    readonly openSection = signal(-1);
    readonly currentPath = signal('/');

    private readonly router = inject(Router);
    private readonly doc = inject(DOCUMENT);
    private readonly destroyRef = inject(DestroyRef);

    ngOnInit(): void {
        this.currentPath.set(this.pathOf(this.router.url));
        this.navigation.load();

        this.router.events
            .pipe(
                filter(event => event instanceof NavigationStart),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe(() => {
                this.closeMenu();
                this.openNav.set(-1);
            });

        // The active item is computed only after NavigationEnd: on NavigationStart
        // router.url still points to the previous page (the router commits the URL
        // after the resolvers), and on the first visit – to "/".
        this.router.events
            .pipe(
                filter(event => event instanceof NavigationEnd),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe(event => this.currentPath.set(this.pathOf(event.urlAfterRedirects)));

        this.destroyRef.onDestroy(() => this.doc.body.classList.remove('menu-open'));
    }

    private pathOf(url: string): string {
        const path = url.split('?')[0].split('#')[0];
        let decoded = path;
        try {
            decoded = decodeURIComponent(path);
        } catch {
            // malformed %-sequence – compare as is
        }
        return decoded.length > 1 ? decoded.replace(/\/+$/, '') : decoded;
    }

    openMenu(): void {
        // The section of the current page starts expanded, as in the mockup.
        const path = this.currentPath();
        this.openSection.set(
            this.navigation.items().findIndex(item => this.navigation.isSectionActive(item, path))
        );
        this.menuOpen.set(true);
        this.doc.body.classList.add('menu-open');
    }

    closeMenu(): void {
        if (!this.menuOpen()) return;
        this.menuOpen.set(false);
        this.doc.body.classList.remove('menu-open');
    }

    /** Opens the map filtered by the typed name (the map reads `?nazwa=`). */
    searchMap(event: Event, query: string): void {
        event.preventDefault();
        const name = query.trim();
        if (!name) return;
        this.closeMenu();
        void this.router.navigate([this.navigation.cta().link], { queryParams: { nazwa: name } });
    }

    /** Subpages that have an address and a name. */
    subLinks(item: NavItem): NavSubItem[] {
        return (item.subnav ?? []).filter(sub => sub.link && sub.subtitle);
    }

    toggleNav(index: number): void {
        this.openNav.update(open => (open === index ? -1 : index));
    }

    /** The list opened from the button closes once the focus leaves its section. */
    onNavFocusOut(index: number, event: FocusEvent): void {
        const item = event.currentTarget as HTMLElement;
        if (this.openNav() === index && !item.contains(event.relatedTarget as Node | null)) {
            this.openNav.set(-1);
        }
    }

    onEscape(): void {
        const open = this.openNav();
        if (open >= 0) {
            this.openNav.set(-1);
            this.doc.getElementById(`site-subnav-toggle-${open}`)?.focus();
        }
        this.closeMenu();
    }

    toggleSection(index: number): void {
        this.openSection.update(open => (open === index ? -1 : index));
    }
}
