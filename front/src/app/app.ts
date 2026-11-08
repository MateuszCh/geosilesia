import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    afterNextRender,
    inject,
    signal
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Footer } from './components/footer/footer';
import { Header } from './components/header/header';
import { ResourceService } from './core/resource.service';
import { ScrollService } from './core/scroll.service';
import { VisitEventsService } from './core/visit-events.service';

/** Delay of the /api/appData prefetch – the heaviest request of the site must not
    compete for bandwidth with the content the user has just opened. */
const PREFETCH_DELAY_MS = 2000;

@Component({
    selector: 'app-root',
    templateUrl: './app.html',
    imports: [RouterOutlet, Header, Footer],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
    /** Controls the "back to top" button – visible only after scrolling away from the top. */
    readonly scrolled = signal(false);

    private readonly router = inject(Router);
    private readonly doc = inject(DOCUMENT);
    private readonly scroll = inject(ScrollService);
    private readonly resource = inject(ResourceService);
    private readonly visitEvents = inject(VisitEventsService);
    private readonly destroyRef = inject(DestroyRef);

    constructor() {
        this.router.events
            .pipe(
                filter(event => event instanceof NavigationEnd),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe(() => this.onNavigated());

        afterNextRender(() => {
            const view = this.doc.defaultView;
            if (!view) return;

            // From now on things that appear animate in (the `enter` mixin). Set after
            // hydration, so the server-rendered view does not fade in a second time.
            this.doc.documentElement.classList.add('motion');

            const onScroll = () => this.scrolled.set(view.scrollY > 0);
            onScroll();
            view.addEventListener('scroll', onScroll, { passive: true });
            this.destroyRef.onDestroy(() =>
                view.removeEventListener('scroll', onScroll)
            );

            const timer = setTimeout(
                () => this.resource.prefetchAppData(),
                PREFETCH_DELAY_MS
            );
            this.destroyRef.onDestroy(() => clearTimeout(timer));

            this.cleanLegacyCaches();
            // visible time and link clicks for the visit statistics (no cookies)
            this.visitEvents.start();
        });
    }

    scrollToTop(): void {
        this.scroll.scrollToTop();
    }

    private onNavigated(): void {
        // The photo preview may have locked page scrolling; leaving the gallery through
        // a link has to unlock it.
        this.doc.body.classList.remove('closedScroll');
    }

    /**
     * Registering ngsw-worker.js replaces the former service worker, but its caches
     * ("static-…", "dynamic-…") stay on the user's disk – ngsw does not know them, so it
     * would never clean them up. We delete everything that does not belong to ngsw.
     */
    private cleanLegacyCaches(): void {
        if (!('caches' in globalThis)) return;
        void caches
            .keys()
            .then(keys =>
                Promise.all(
                    keys
                        .filter(key => !key.startsWith('ngsw:'))
                        .map(key => caches.delete(key))
                )
            )
            .catch(() => {
                // No access to the Cache API (e.g. private mode) is not an error –
                // there is simply nothing to clean up.
            });
    }
}
