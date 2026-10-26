import { DOCUMENT, EnvironmentProviders, PLATFORM_ID, inject, provideAppInitializer } from '@angular/core';
import { ViewportScroller, isPlatformBrowser } from '@angular/common';
import { NavigationEnd, NavigationStart, Router, Scroll } from '@angular/router';
import { filter, take } from 'rxjs/operators';

/** How long a restored position waits for the page below it to load. */
const KEEP_FOR_MS = 5000;
const STORE_KEY = 'scroll-positions';
/** Addresses remembered in the tab; the oldest go first. */
const STORE_LIMIT = 50;
/** Anything the reader does to move the page ends the wait. */
const READER_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Back and forward return the reader to where they were on the page.
 *
 * Within the app the router remembers the position (scrollPositionRestoration: 'enabled'),
 * but it scrolls only once, right after the page renders – while TOP 50, counts or news may
 * still be loading and the page is too short to reach that point. So the position is kept
 * while the page grows, until it is reached, the reader moves the page, or five seconds pass.
 *
 * Links in CMS text and other sites leave the app: coming back loads the page anew (unless
 * the browser kept it in its back/forward cache) and the router remembers nothing. For that
 * the positions are also kept in the tab's sessionStorage, by address.
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
            const apply = () => {
                scroller.scrollToPosition([0, top], { behavior: 'instant' });
                if (Math.abs(view.scrollY - top) < 2) stop();
            };
            const observer = new ResizeObserver(() => apply());
            const timer = setTimeout(() => stop(), KEEP_FOR_MS);
            const stop = () => {
                observer.disconnect();
                clearTimeout(timer);
                READER_EVENTS.forEach(type => view.removeEventListener(type, stop));
                release = undefined;
            };
            release = stop;
            READER_EVENTS.forEach(type => view.addEventListener(type, stop, { passive: true }));
            // Again whenever the page changes height.
            observer.observe(view.document.body);
            apply();
        };

        router.events.subscribe(event => {
            if (event instanceof NavigationStart) {
                release?.();
                // Before the first navigation ends there is no page yet, only the address
                // whose remembered position is about to be restored.
                if (router.navigated) savePosition(view, router.url, view.scrollY);
            } else if (event instanceof Scroll && event.position) {
                keep(event.position[1]);
            }
        });

        view.addEventListener('pagehide', () => savePosition(view, router.url, view.scrollY));

        const entry = view.performance.getEntriesByType('navigation')[0] as
            | PerformanceNavigationTiming
            | undefined;
        if (entry?.type === 'back_forward' || entry?.type === 'reload') {
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
