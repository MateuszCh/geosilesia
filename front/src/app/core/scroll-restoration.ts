import { DOCUMENT, EnvironmentProviders, PLATFORM_ID, inject, provideAppInitializer } from '@angular/core';
import { ViewportScroller, isPlatformBrowser } from '@angular/common';
import { NavigationEnd, NavigationStart, Router, Scroll } from '@angular/router';
import { filter, take } from 'rxjs/operators';

/** How long a restored position is held while the page around it loads. */
const KEEP_FOR_MS = 5000;
const STORE_KEY = 'scroll-positions';
/** Addresses remembered in the tab; the oldest go first. */
const STORE_LIMIT = 50;
/** What the reader does to move the page up or down; any of it ends the wait. */
const READER_EVENTS = ['wheel', 'touchmove', 'keydown'] as const;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/**
 * Back and forward return the reader to where they were on the page.
 *
 * Within the app the router remembers the position (scrollPositionRestoration: 'enabled'),
 * but it scrolls only once, right after the page renders – while TOP 50, counts or news may
 * still be loading: the page may be too short to reach that point, or grow above it later and
 * move what the reader saw down. So the position is held whenever the page changes height,
 * until the reader moves the page or five seconds pass.
 *
 * Going to another site leaves the app: coming back loads the page anew (unless the browser
 * kept it in its back/forward cache) and the router remembers nothing. For that the positions
 * are also kept in the tab's sessionStorage, by address. A reload is not a way back: it
 * always opens the page at the top.
 */
export function provideScrollRestoration(): EnvironmentProviders {
    return provideAppInitializer(() => {
        if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
        const router = inject(Router);
        const scroller = inject(ViewportScroller);
        const view = inject(DOCUMENT).defaultView;
        if (!view) return;

        let release: (() => void) | undefined;

        const keep = (top: number) => {
            release?.();
            const apply = () => scroller.scrollToPosition([0, top], { behavior: 'instant' });
            const observer = new ResizeObserver(apply);
            const timer = setTimeout(() => stop(), KEEP_FOR_MS);
            const onReader = (event: Event) => {
                if (movesPage(event)) stop();
            };
            const stop = () => {
                observer.disconnect();
                clearTimeout(timer);
                READER_EVENTS.forEach(type => view.removeEventListener(type, onReader));
                release = undefined;
            };
            release = stop;
            READER_EVENTS.forEach(type => view.addEventListener(type, onReader, { passive: true }));
            // Again whenever the page changes height.
            observer.observe(view.document.body);
            apply();
        };

        let back = false;
        router.events.subscribe(event => {
            if (event instanceof NavigationStart) {
                release?.();
                back = event.navigationTrigger === 'popstate';
                // Before the first navigation ends there is no page yet, only the address
                // whose remembered position is about to be restored.
                if (router.navigated) savePosition(view, router.url, view.scrollY);
            } else if (event instanceof Scroll && back) {
                // The router knows only the pages this document showed. After a reload, back
                // leads within the same document to pages the one before it showed.
                const top = event.position?.[1] ?? readPositions(view)[router.url];
                // After the router's own scroll, which knowing no position goes to the top.
                if (top) setTimeout(() => keep(top));
            }
        });

        view.addEventListener('pagehide', () => savePosition(view, router.url, view.scrollY));

        const entry = view.performance.getEntriesByType('navigation')[0] as
            | PerformanceNavigationTiming
            | undefined;
        if (entry?.type === 'back_forward') {
            router.events
                .pipe(
                    filter(event => event instanceof NavigationEnd),
                    take(1)
                )
                .subscribe(() => {
                    const top = readPositions(view)[router.url];
                    if (top) setTimeout(() => keep(top));
                });
        }
    });
}

/**
 * Only a move up or down counts. A sideways swipe is how a Mac trackpad goes back, and its
 * last wheel events still reach the page after it has changed; the mouse's back button
 * sends a click. Both used to end the wait while the page was still growing, leaving the
 * reader just above the footer.
 */
function movesPage(event: Event): boolean {
    if (event instanceof WheelEvent) return Math.abs(event.deltaY) > Math.abs(event.deltaX);
    if (event instanceof KeyboardEvent) return SCROLL_KEYS.has(event.key);
    return true;
}

function readPositions(view: Window): Record<string, number> {
    try {
        return JSON.parse(view.sessionStorage.getItem(STORE_KEY) ?? '{}');
    } catch {
        return {};
    }
}

function savePosition(view: Window, url: string, top: number): void {
    try {
        const positions = readPositions(view);
        delete positions[url];
        positions[url] = Math.round(top);
        const urls = Object.keys(positions);
        urls.slice(0, Math.max(0, urls.length - STORE_LIMIT)).forEach(old => delete positions[old]);
        view.sessionStorage.setItem(STORE_KEY, JSON.stringify(positions));
    } catch {
        // No sessionStorage (private mode, blocked storage): back simply starts at the top.
    }
}
