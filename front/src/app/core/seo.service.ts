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
 * Port of seo.service.js. Title and description derivation stays in shared/seo-meta.js –
 * the same module the server uses, so both sides must produce identical results.
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

    // The server injects a canonical built from config.siteUrl. If we computed the origin
    // from window.location, a visit through another host (www or not, http vs https) would
    // make the client overwrite it with whatever address the visitor used — exactly the
    // duplicate content siteUrl protects against. So the origin is read once, from the
    // canonical inserted by the server.
    private cachedOrigin: string | null = null;

    private serverOrigin(): string {
        const el = this.head.querySelector('link[rel="canonical"]');
        const href = el?.getAttribute('href') ?? '';
        return /^(https?:\/\/[^/]+)/.exec(href)?.[1] ?? '';
    }

    private origin(): string {
        if (this.cachedOrigin === null) {
            // The fallback covers the case without injection – e.g. when the shell came
            // from the service worker cache.
            this.cachedOrigin =
                this.serverOrigin() ||
                (this.isBrowser ? this.doc.defaultView!.location.origin : '');
        }
        return this.cachedOrigin;
    }

    /**
     * For fields some pages lack: on SPA navigation it is not enough to skip setting the
     * tag – it has to be removed, otherwise it would stay in <head> with the previous
     * page's data.
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
     * The same for the per-page JSON-LD. The selector targets data-seo="webpage" so as not
     * to touch the site-wide Organization block.
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
        // On the server <head> is assembled by app.js (injectSeo) from the same
        // shared/seo-meta.js. The origin is unknown here, so we would add a second
        // canonical and og:url with a relative path outside the seo:start/end block.
        if (!this.isBrowser) return;

        // The path comes from the page's pageUrl, not from the current address – otherwise
        // a visit to "/slownik/" would claim to be canonical separately from "/slownik".
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
     * Meta based on the page data (seoTitle/seoDescription, or values derived from the
     * content when they are missing).
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
     * Neutral meta for the 404 page (soft 404). The canonical points to the address itself,
     * as the server does – without the path the home page URL would claim it.
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

    /** Path without query and hash, decoded – apply() encodes it again with encodeURI. */
    private decodedPath(url: string): string {
        const path = url.split('?')[0].split('#')[0];
        try {
            return decodeURIComponent(path);
        } catch {
            return path; // malformed %-sequence – take it as is
        }
    }
}
