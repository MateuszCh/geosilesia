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
import { internalLink } from '../../core/cms-link';

@Component({
    selector: 'app-header',
    templateUrl: './header.html',
    imports: [RouterLink],
    host: {
        '(document:keydown.escape)': 'closeMenu()'
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
            .subscribe(() => this.closeMenu());

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

    toggleSection(index: number): void {
        this.openSection.update(open => (open === index ? -1 : index));
    }
}
