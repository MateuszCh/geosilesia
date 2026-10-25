import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    OnInit,
    computed,
    inject,
    input,
    linkedSignal,
    signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { GalleryData, GalleryImage } from '../../models/row.model';
import { AlbumSummary, Top50PostData } from '../../models/post.model';
import { albumCategory } from '../../core/albums';
import { formatDate } from '../../core/dates';
import { NavigationService } from '../../core/navigation.service';
import { ResourceService } from '../../core/resource.service';
import { internalLink } from '../../core/cms-link';
import * as seoMeta from '../../../../../shared/seo-meta';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { PhotoViewer, ViewerPhoto } from '../photo-viewer/photo-viewer';
import { plural } from '../../shared/plural';

/** How many photos the album shows before "Pokaż pozostałe". */
const COLLAPSED_PHOTOS = 12;
const OTHER_ALBUMS = 4;

/**
 * An album page: header, intro, the photo grid with a dark photo viewer, the TOP 50 entry
 * that links to the album and other albums of the same category.
 */
@Component({
    selector: 'app-gallery',
    templateUrl: './gallery.html',
    // CMS HTML in <p [innerHTML]>: if an editor puts a block element in it (<p>, <div>,
    // <ul>), the browser rearranges the server-sent DOM and hydration breaks. So the
    // component re-renders in the browser; the content is in the HTML for robots anyway.
    host: { ngSkipHydration: 'true' },
    imports: [RouterLink, TrustedPipe, PhotoViewer],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Gallery implements OnInit {
    readonly component = input.required<GalleryData>();
    /** Normalized path of the album page – used to find the album in the album list. */
    readonly pageUrl = input('');

    protected readonly collapsedCount = COLLAPSED_PHOTOS;

    /** Order from the CMS; the same order applies to thumbnails and the preview. */
    readonly images = computed<GalleryImage[]>(() =>
        [...(this.component().catalogue ?? [])]
            .filter(image => image.src)
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    );

    readonly intro = computed(() =>
        (this.component().paragraphs ?? []).map(paragraph => paragraph?.paragraph ?? '').filter(Boolean)
    );

    readonly current = signal<number | undefined>(undefined);
    /** The viewer's own copy of the open photo; it browses without touching `current`. */
    readonly viewerIndex = linkedSignal(() => this.current() ?? 0);
    readonly showAll = signal(false);

    readonly viewerPhotos = computed<ViewerPhoto[]>(() =>
        this.images().map(image => ({
            src: image.src,
            description: image.title || image.description,
            author: image.author
        }))
    );

    private readonly albums = signal<AlbumSummary[]>([]);
    private readonly top50Posts = signal<{ number: number; title: string; urls: string[] }[]>([]);

    private readonly navigation = inject(NavigationService);
    private readonly resource = inject(ResourceService);
    private readonly destroyRef = inject(DestroyRef);

    readonly crumbs = computed(() =>
        this.navigation.trail(this.pageUrl()).filter(crumb => !!crumb.link)
    );
    readonly galleryLink = computed(() => this.crumbs()[0]?.link);

    private readonly self = computed(() => this.albums().find(album => album.pageUrl === this.pageUrl()));

    /** The album's own field first; until it is migrated, the category from the album list. */
    readonly category = computed(() => albumCategory(this.component().category || this.self()?.category));

    readonly categoryCount = computed(() => {
        const key = this.category()?.key;
        return key ? this.albums().filter(album => !album.hidden && albumCategory(album.category)?.key === key).length : 0;
    });

    readonly visibleAlbumCount = computed(() => this.albums().filter(album => !album.hidden).length);

    readonly otherAlbums = computed(() => {
        const key = this.category()?.key;
        const visible = this.albums().filter(album => !album.hidden && album.pageUrl !== this.pageUrl());
        const same = key ? visible.filter(album => albumCategory(album.category)?.key === key) : [];
        return (same.length ? same : visible).slice(0, OTHER_ALBUMS);
    });

    /** The TOP 50 entry whose "galeria" link points to this album. */
    readonly top50 = computed(() => {
        const path = this.pageUrl();
        const entry = this.top50Posts().find(post => post.urls.includes(path));
        if (!entry) return undefined;
        const item = this.navigation.items().find(nav => /top\s*50/i.test(nav.title ?? ''));
        const link = item ? this.navigation.sectionLink(item) : undefined;
        return link ? { ...entry, link } : undefined;
    });

    /** "19 zdjęć i rycin · Ryszard Chybiorz · 09.11.2019, ostatnia aktualizacja 10.10.2026" */
    readonly meta = computed(() => {
        const data = this.component();
        const count = this.images().length;
        const updated = formatDate(data.updated);
        const dates = [formatDate(data.published), updated ? `ostatnia aktualizacja ${updated}` : '']
            .filter(Boolean)
            .join(', ');
        return [count ? `${count} ${plural(count, 'zdjęcie', 'zdjęcia', 'zdjęć')} i rycin` : '', data.author, dates]
            .filter(Boolean)
            .join(' · ');
    });

    ngOnInit(): void {
        forkJoin({
            albums: this.resource.loadAlbums(),
            top50: this.resource.loadPostsFromNetwork<Top50PostData>('top50')
        })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(({ albums, top50 }) => {
                this.albums.set(albums);
                this.top50Posts.set(
                    top50.map(post => ({
                        number: Number(post.data?.number) || 0,
                        title: post.title ?? '',
                        urls: (post.data?.links ?? [])
                            .filter(link => link?.kind === 'galeria' && link.url)
                            .map(link => seoMeta.normalizePath(internalLink(link!.url!.replace(/^https?:\/\/[^/]+/, ''))))
                    }))
                );
            });
    }

    photosLabel(count: number): string {
        return plural(count, 'zdjęcie', 'zdjęcia', 'zdjęć');
    }

    albumsLabel(count: number): string {
        return plural(count, 'album', 'albumy', 'albumów');
    }

    open(index: number): void {
        this.current.set(index);
    }

    close(): void {
        this.current.set(undefined);
    }
}
