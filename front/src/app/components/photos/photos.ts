import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ContentService } from '../../core/content.service';
import { ResourceService } from '../../core/resource.service';
import { internalLink } from '../../core/cms-link';
import { GalleryImage, PhotosData, Slide } from '../../models/row.model';
import { TrustedPipe } from '../../shared/trusted.pipe';
import { plural } from '../../shared/plural';
import { photoCredit } from '../../shared/photo-credit';
import { PhotoViewer, ViewerPhoto } from '../photo-viewer/photo-viewer';
import { HtmlDirective } from '../../shared/html.directive';

interface PhotoView {
    src: string;
    title: string;
    english?: string;
    /** "Olsztyn koło Częstochowy · Fot. Marek Tęcza" */
    meta: string;
    author?: string;
    description?: string;
}

function fromSlide(slide: Slide): PhotoView {
    const author = photoCredit(slide.author) || undefined;
    return {
        src: slide.image!,
        title: slide.text ?? '',
        english: slide.text_english,
        meta: [slide.place, author].filter(Boolean).join(' · '),
        author,
        description: slide.description
    };
}

function fromFile(file: GalleryImage): PhotoView {
    return {
        src: file.src!,
        title: file.title ?? '',
        meta: file.author ?? '',
        author: file.author,
        description: file.description
    };
}

/**
 * Photographs: from the home page banner or from a catalogue of the file library, as a strip
 * of four ("Region w obiektywie") or as a grid with the photo viewer.
 */
@Component({
    selector: 'app-photos',
    templateUrl: './photos.html',
    imports: [RouterLink, TrustedPipe, PhotoViewer, HtmlDirective],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class Photos implements OnInit {
    readonly component = input.required<PhotosData>();

    readonly viewerIndex = signal<number | undefined>(undefined);
    private readonly slides = signal<Slide[]>([]);
    private readonly albumCount = signal(0);

    private readonly resource = inject(ResourceService);
    private readonly content = inject(ContentService);
    private readonly destroyRef = inject(DestroyRef);

    readonly grid = computed(() => this.component().variant === 'siatka z podglądem');
    private readonly fromBanner = computed(() => this.component().source !== 'katalog');

    readonly photos = computed<PhotoView[]>(() => {
        if (this.fromBanner()) return this.slides().filter(slide => slide.image).map(fromSlide);
        const catalogue = this.component().catalogue;
        return Array.isArray(catalogue) ? catalogue.filter(file => file.src).map(fromFile) : [];
    });

    readonly viewerPhotos = computed<ViewerPhoto[]>(() =>
        this.photos().map(photo => ({
            src: photo.src,
            title: photo.title,
            description: photo.description,
            author: photo.author
        }))
    );

    /** "Galeria — 48 albumów" – the album count is added to the label by itself. */
    readonly linkInfo = computed(() => {
        const href = internalLink(this.component().link);
        if (!href) return undefined;
        const label = this.component().link_label || 'Galeria';
        const count = this.albumCount();
        return { href, label: count ? `${label} — ${count} ${plural(count, 'album', 'albumy', 'albumów')}` : label };
    });

    ngOnInit(): void {
        if (this.fromBanner()) {
            this.resource
                .loadPageFromNetwork('/')
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(page => {
                    const banner = page?.rows?.find(row => row.type === 'homepage_banner');
                    this.slides.set(banner?.type === 'homepage_banner' ? (banner.data?.slides ?? []) : []);
                });
        }
        if (this.component().link && /galeri/i.test(this.component().link_label || 'Galeria')) {
            this.content
                .albums()
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe(albums => this.albumCount.set(albums.filter(album => !album.hidden).length));
        }
    }
}
