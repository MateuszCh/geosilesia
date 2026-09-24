import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    ElementRef,
    afterNextRender,
    inject,
    signal,
    viewChild
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Header } from './components/header/header';
import { ResourceService } from './core/resource.service';
import { ScrollService } from './core/scroll.service';

/** Opóźnienie prefetchu /api/appData – najcięższe zapytanie serwisu nie ma prawa
    konkurować o łącze z treścią, którą użytkownik właśnie otworzył. */
const PREFETCH_DELAY_MS = 2000;

@Component({
    selector: 'app-root',
    templateUrl: './app.html',
    imports: [RouterOutlet, Header],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
    /** Sterowanie przyciskiem „do góry" – widoczny dopiero po odjechaniu od szczytu. */
    readonly scrolled = signal(false);

    private readonly page = viewChild.required<ElementRef<HTMLElement>>('page');
    private readonly router = inject(Router);
    private readonly doc = inject(DOCUMENT);
    private readonly scroll = inject(ScrollService);
    private readonly resource = inject(ResourceService);
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
        });
    }

    scrollToTop(): void {
        this.scroll.scrollToTop();
    }

    private onNavigated(): void {
        // Podgląd zdjęcia mógł zablokować przewijanie strony; wyjście z galerii przez
        // link musi je odblokować.
        this.doc.body.classList.remove('closedScroll');
        this.restartFade();
    }

    /** Odtwarza dawny crossfade z ngAnimate: zdjęcie i ponowne dołożenie klasy
        restartuje animację CSS, samo ustawienie jej nie wznawia. */
    private restartFade(): void {
        const element = this.page().nativeElement;
        element.classList.remove('fade--in');
        void element.offsetWidth;
        element.classList.add('fade--in');
    }

    /**
     * Rejestracja ngsw-worker.js zastępuje dawnego service workera, ale jego cache'e
     * ("static-…", "dynamic-…") zostają na dysku użytkownika – ngsw ich nie zna, więc
     * nigdy by ich nie posprzątał. Kasujemy wszystko, co nie należy do ngsw.
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
                // Brak dostępu do Cache API (np. tryb prywatny) nie jest błędem –
                // po prostu nie ma czego sprzątać.
            });
    }
}
