import { Injectable, computed, inject, signal } from '@angular/core';
import { ResourceService } from './resource.service';
import { internalLink } from './cms-link';
import { NavItem, NavigationPost, NavigationPostData } from '../models/post.model';

/** Defaults used until the navigation post gets the variant C fields. */
const DEFAULT_CTA_LABEL = 'Mapa atrakcji';
const DEFAULT_FOOTER_TEXT =
    'Edukacyjno-informacyjny serwis internetowy o dziedzictwie geologicznym, geomorfologicznym i poprzemysłowym województwa śląskiego.';

export interface Crumb {
    title: string;
    link?: string;
}

export interface NextInSection {
    section: string;
    title: string;
    link: string;
}

export interface FooterColumn {
    title: string;
    links: { title: string; link: string }[];
}

export interface SectionLinks {
    title: string;
    links: { title: string; link: string; current: boolean }[];
}

/** Path of a CMS link in the form the router uses: leading slash, no trailing one. */
function pathOf(link: string | undefined): string | undefined {
    const absolute = internalLink(link);
    if (!absolute) return undefined;
    const path = absolute.split('?')[0].split('#')[0];
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/**
 * The single `navigation` post drives the header, the footer, the mobile menu, the
 * breadcrumbs and "Dalej w dziale". Loaded once for the whole app.
 */
@Injectable({ providedIn: 'root' })
export class NavigationService {
    private readonly resource = inject(ResourceService);
    private readonly data = signal<NavigationPostData | undefined>(undefined);
    private requested = false;

    readonly items = computed<NavItem[]>(() => this.data()?.nav ?? []);

    /** The header button; until `cta_link` is set it leads home, where the map lives today. */
    readonly cta = computed(() => {
        const data = this.data();
        return {
            label: data?.cta_label || DEFAULT_CTA_LABEL,
            link: internalLink(data?.cta_link) || '/'
        };
    });

    readonly footerText = computed(() => this.data()?.footer_text || DEFAULT_FOOTER_TEXT);
    readonly footerNote = computed(() => this.data()?.footer_note || '');
    readonly albumsMoreTitle = computed(() => this.data()?.albums_more_title || 'Inne albumy');

    /** One column per section with subpages; subpages marked hide_in_footer are left out. */
    readonly footerColumns = computed<FooterColumn[]>(() =>
        this.items()
            .filter(item => item.title && item.subnav?.length)
            .map(item => ({
                title: item.title!,
                links: (item.subnav ?? [])
                    .filter(sub => sub.subtitle && sub.link && !sub.hide_in_footer)
                    .map(sub => ({ title: sub.subtitle!, link: internalLink(sub.link)! }))
            }))
            .filter(column => column.links.length)
    );

    /**
     * The reverse of other screens: network first, IndexedDB only when it fails. There is
     * one navigation for the whole site and it rarely changes, so there is no point in
     * flashing an old version before the new one arrives.
     */
    load(): void {
        if (this.requested) return;
        this.requested = true;
        this.resource
            .loadPostsFromNetwork<NavigationPostData>('navigation')
            .subscribe(posts => {
                if (posts.length) {
                    this.set(posts);
                    return;
                }
                if (this.resource.isOfflineAvailable()) {
                    void this.resource
                        .loadPostsFromCache<NavigationPostData>('navigation')
                        .then(cached => this.set(cached));
                }
            });
    }

    private set(posts: NavigationPost[]): void {
        this.data.set(posts[0]?.data);
    }

    /**
     * Where a section link leads. Variant C shows sections as plain links; until the CMS
     * gives them their own address, a section opens its first subpage.
     */
    sectionLink(item: NavItem): string | undefined {
        return (
            internalLink(item.link || undefined) ??
            internalLink(item.subnav?.find(sub => sub.link)?.link)
        );
    }

    /** A section is active on its own address, on any of its subpages and below them. */
    isSectionActive(item: NavItem, path: string): boolean {
        const own = pathOf(item.link || undefined);
        const matches = (target: string | undefined) =>
            !!target && target !== '/' && (path === target || path.startsWith(`${target}/`));
        return matches(own) || !!item.subnav?.some(sub => matches(pathOf(sub.link)));
    }

    isCurrent(link: string | undefined, path: string): boolean {
        return pathOf(link) === path;
    }

    /** Section and page for the breadcrumbs, e.g. "GeoŚląsk › Budowa geologiczna". */
    trail(path: string): Crumb[] {
        for (const item of this.items()) {
            const sub = item.subnav?.find(entry => pathOf(entry.link) === path);
            if (sub && item.title) {
                return [
                    { title: item.title, link: this.sectionLink(item) },
                    { title: sub.subtitle ?? '' }
                ];
            }
        }
        // Albums live under "galeria/…" and belong to the section that links to the gallery.
        if (path.startsWith('/galeria/')) {
            const gallery = this.items().find(item => /galeri/i.test(item.title ?? ''));
            if (gallery?.title) {
                return [{ title: gallery.title, link: this.sectionLink(gallery) }];
            }
        }
        return [];
    }

    /** The section a page belongs to, with all its subpages – the section bar of content pages. */
    section(path: string): SectionLinks | undefined {
        const item = this.items().find(entry => entry.subnav?.some(sub => pathOf(sub.link) === path));
        if (!item?.title) return undefined;
        return {
            title: item.title,
            links: (item.subnav ?? [])
                .filter(sub => sub.link && sub.subtitle)
                .map(sub => ({
                    title: sub.subtitle!,
                    link: internalLink(sub.link)!,
                    current: pathOf(sub.link) === path
                }))
        };
    }

    /** The following subpage of the same section; wraps around to the first one. */
    next(path: string): NextInSection | undefined {
        for (const item of this.items()) {
            const subs = (item.subnav ?? []).filter(sub => sub.link && sub.subtitle);
            const index = subs.findIndex(sub => pathOf(sub.link) === path);
            if (index === -1 || subs.length < 2 || !item.title) continue;
            const next = subs[(index + 1) % subs.length];
            return { section: item.title, title: next.subtitle!, link: internalLink(next.link)! };
        }
        return undefined;
    }
}
