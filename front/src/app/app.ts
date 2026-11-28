import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    PLATFORM_ID,
    afterNextRender,
    inject,
    signal
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Footer } from './components/footer/footer';
import { Header } from './components/header/header';
import { watchBrokenImages } from './core/image-fallback';
import { ResourceService } from './core/resource.service';
import { ScrollService } from './core/scroll.service';
import { VisitEventsService } from './core/visit-events.service';

/** Delay of the /api/appData prefetch, counted from the window's load event – the heaviest
    request of the site (~0.5 MB) must not compete for bandwidth with the content the user
    has just opened, including the lazy images that start right after load. */
const PREFETCH_DELAY_MS = 5000;

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
    private readonly updates = inject(SwUpdate);

    constructor() {
        // Before the first render, so the images it creates are covered from the start.
        const view = this.doc.defaultView;
        if (isPlatformBrowser(inject(PLATFORM_ID)) && view) {
            this.destroyRef.onDestroy(watchBrokenImages(this.doc, view));
        }

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

            this.schedulePrefetch(view);

            this.cleanLegacyCaches();
            this.watchUpdates(view);
            // visible time and link clicks for the visit statistics (no cookies)
            this.visitEvents.start();
        });
    }

    scrollToTop(): void {
        this.scroll.scrollToTop();
    }

    /**
     * Offline prefetch: after the page has loaded, a quiet moment and an idle main thread.
     * Only in the installed app (started from the home screen): that is where someone plans
     * to use the site without a network, in the field. A visitor in a browser tab gets the
     * pages they open stored on the way, not the whole site (~0.5 MB). Skipped as well when
     * the visitor asked to save data or is on a 2G-class connection.
     */
    private schedulePrefetch(view: Window): void {
        if (!isInstalledApp(view)) return;
        const connection = (view.navigator as Navigator & {
            connection?: { saveData?: boolean; effectiveType?: string };
        }).connection;
        if (connection?.saveData || /2g/.test(connection?.effectiveType ?? '')) return;

        let timer: ReturnType<typeof setTimeout> | undefined;
        let idle: number | undefined;
        const prefetch = () => this.resource.prefetchAppData();
        const onLoad = () => {
            timer = setTimeout(() => {
                if (view.requestIdleCallback) {
                    idle = view.requestIdleCallback(prefetch, { timeout: 5000 });
                } else {
                    prefetch();
                }
            }, PREFETCH_DELAY_MS);
        };
        if (this.doc.readyState === 'complete') {
            onLoad();
        } else {
            view.addEventListener('load', onLoad, { once: true });
        }
        this.destroyRef.onDestroy(() => {
            view.removeEventListener('load', onLoad);
            clearTimeout(timer);
            if (idle !== undefined) view.cancelIdleCallback?.(idle);
        });
    }

    /**
     * After a deployment the service worker keeps serving the version the tab started with,
     * and a phone keeps an installed app in memory for days – while the API already sends data
     * shaped for the new front. Once the new version is downloaded, the next link the reader
     * follows inside the app is opened as a full load instead, which starts the new version
     * without cutting into what they are reading. A worker that lost files of its own version
     * cannot serve the app at all: then the page reloads at once.
     */
    private watchUpdates(view: Window): void {
        if (!this.updates.isEnabled) return;
        let ready = false;
        this.updates.versionUpdates
            .pipe(
                filter(event => event.type === 'VERSION_READY'),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe(() => (ready = true));
        this.router.events
            .pipe(
                filter((event): event is NavigationStart => event instanceof NavigationStart),
                takeUntilDestroyed(this.destroyRef)
            )
            .subscribe(event => {
                // popstate too: back/forward also lands on the new version
                if (ready) view.location.assign(event.url);
            });
        this.updates.unrecoverable
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => view.location.reload());
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

/**
 * Whether the site runs as the installed app: the display mode the manifest asks for
 * ("standalone"), or Safari's own flag on iOS, where an app added to the home screen does
 * not always report the display mode.
 */
function isInstalledApp(view: Window): boolean {
    return (
        view.matchMedia?.('(display-mode: standalone)').matches === true ||
        (view.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
}
