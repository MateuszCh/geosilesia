import { DOCUMENT, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import * as seoMeta from '../../../../shared/seo-meta';
import { Page } from '../models/page.model';

interface SeoData {
    title: string;
    description: string;
    image: string;
    path?: string;
    updated?: string;
}

/**
 * Port seo.service.js. Derywacja tytułu i opisu została w shared/seo-meta.js – to ten
 * sam moduł, z którego korzysta serwer, więc obie strony muszą dawać identyczny wynik.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
    private readonly doc = inject(DOCUMENT);
    private readonly meta = inject(Meta);
    private readonly titleService = inject(Title);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    private get head(): HTMLHeadElement {
        return this.doc.head;
    }

    // Serwer wstrzykuje canonical zbudowany z config.siteUrl. Gdybyśmy liczyli origin
    // z window.location, przy wejściu przez inny host (www vs bez, http vs https) klient
    // zamazałby go adresem, którego akurat użył odwiedzający — czyli dokładnie tym
    // duplikatem treści, przed którym siteUrl chroni. Czytamy więc origin raz,
    // z canonical wstawionego przez serwer.
    private cachedOrigin: string | null = null;

    private serverOrigin(): string {
        const el = this.head.querySelector('link[rel="canonical"]');
        const href = el?.getAttribute('href') ?? '';
        return /^(https?:\/\/[^/]+)/.exec(href)?.[1] ?? '';
    }

    private origin(): string {
        if (this.cachedOrigin === null) {
            // Fallback dotyczy sytuacji bez wstrzyknięcia – np. gdy shell przyszedł
            // z cache'u service workera.
            this.cachedOrigin =
                this.serverOrigin() ||
                (this.isBrowser ? this.doc.defaultView!.location.origin : '');
        }
        return this.cachedOrigin;
    }

    /**
     * Dla pól, których część stron nie ma: przy nawigacji SPA nie wystarczy nie ustawić
     * tagu – trzeba go usunąć, inaczej zostałby w <head> z danymi poprzedniej strony.
     */
    private setOrRemoveMeta(
        selector: string,
        tag: { name?: string; property?: string },
        content: string | undefined
    ): void {
        if (content) {
            this.meta.updateTag({ ...tag, content });
            return;
        }
        this.meta.removeTag(selector);
    }

    /**
     * To samo dla per-stronowego JSON-LD. Selektor celuje w data-seo="webpage", żeby nie
     * ruszyć ogólnoserwisowego bloku Organization.
     */
    private setOrRemoveWebPageJsonLd(data: object | null): void {
        const selector = 'script[type="application/ld+json"][data-seo="webpage"]';
        let el = this.head.querySelector(selector);
        if (!data) {
            el?.remove();
            return;
        }
        if (!el) {
            el = this.doc.createElement('script');
            el.setAttribute('type', 'application/ld+json');
            el.setAttribute('data-seo', 'webpage');
            this.head.appendChild(el);
        }
        el.textContent = JSON.stringify(data);
    }

    private upsertLink(rel: string, href: string): void {
        let el = this.head.querySelector(`link[rel="${rel}"]`);
        if (!el) {
            el = this.doc.createElement('link');
            el.setAttribute('rel', rel);
            this.head.appendChild(el);
        }
        el.setAttribute('href', href);
    }

    private absolute(url: string): string {
        if (!url) return url;
        if (/^https?:\/\//.test(url)) return url;
        return this.origin() + (url.startsWith('/') ? '' : '/') + url;
    }

    private apply(data: SeoData): void {
        // Ścieżkę bierzemy z pageUrl strony, nie z bieżącego adresu – inaczej wejście
        // na "/slownik/" ogłosiłoby się kanonicznym osobno od "/slownik".
        const canonical = this.origin() + encodeURI(data.path ?? '');
        const image = this.absolute(data.image);

        this.titleService.setTitle(data.title);
        this.meta.updateTag({ name: 'description', content: data.description });
        this.upsertLink('canonical', canonical);

        this.meta.updateTag({ property: 'og:title', content: data.title });
        this.meta.updateTag({ property: 'og:description', content: data.description });
        this.meta.updateTag({ property: 'og:url', content: canonical });
        this.meta.updateTag({ property: 'og:type', content: 'website' });
        this.meta.updateTag({ property: 'og:site_name', content: seoMeta.SITE_NAME });
        this.meta.updateTag({ property: 'og:image', content: image });

        this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
        this.meta.updateTag({ name: 'twitter:title', content: data.title });
        this.meta.updateTag({ name: 'twitter:description', content: data.description });
        this.meta.updateTag({ name: 'twitter:image', content: image });

        this.setOrRemoveMeta(
            'property="og:updated_time"',
            { property: 'og:updated_time' },
            data.updated
        );
        this.setOrRemoveWebPageJsonLd(
            data.updated
                ? {
                      '@context': 'https://schema.org',
                      '@type': 'WebPage',
                      url: canonical,
                      name: data.title,
                      description: data.description,
                      dateModified: data.updated
                  }
                : null
        );
    }

    /**
     * Meta na podstawie danych strony (seoTitle/seoDescription, a w ich braku –
     * wyprowadzone z treści).
     */
    applyForPage(page: Page): void {
        const built = seoMeta.buildMeta(page);
        this.apply({
            title: built.title,
            description: built.description,
            image: seoMeta.DEFAULT_IMAGE,
            path: page?.pageUrl ? seoMeta.normalizePath(page.pageUrl) : '',
            updated: seoMeta.updatedIso(page)
        });
    }

    /**
     * Neutralne meta dla strony 404 (soft-404). Canonical wskazuje na sam adres, tak jak
     * robi to serwer – bez ścieżki ogłosiłby się nim adres strony głównej.
     */
    applyNotFound(url: string): void {
        this.apply({
            title: seoMeta.NOT_FOUND_TITLE,
            description: seoMeta.DEFAULT_DESCRIPTION,
            image: seoMeta.DEFAULT_IMAGE,
            path: this.decodedPath(url),
            updated: ''
        });
    }

    /** Ścieżka bez query i hasha, zdekodowana – apply() koduje ją ponownie przez encodeURI. */
    private decodedPath(url: string): string {
        const path = url.split('?')[0].split('#')[0];
        try {
            return decodeURIComponent(path);
        } catch {
            return path; // uszkodzona sekwencja %-owa – bierzemy jak leci
        }
    }
}
