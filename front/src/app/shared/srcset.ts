import { Pipe, PipeTransform } from '@angular/core';

/**
 * srcset for CMS photos. The server (images.js, GET /img/<width>/<path under uploads/>)
 * serves WebP copies of /uploads/*.jpg|png at these widths, never wider than the original.
 * Keep in sync with WIDTHS in images.js.
 */
const WIDTHS = [400, 800, 1200, 1600];
const UPLOADS = '/uploads/';
const PHOTO = /\.(jpe?g|png)$/i;

/** Encodes a CMS path once, whether it came encoded or raw ("4_lisowice (1).jpg"). */
function encodePath(value: string): string {
    let raw = value;
    try {
        raw = decodeURI(value);
    } catch {
        // a stray "%" – keep the value as it is
    }
    // Commas and spaces separate srcset candidates, so they must not stay bare.
    return encodeURI(raw).replace(/,/g, '%2C');
}

/** "…/img/400/a.jpg 400w, …" for a photo from /uploads, null for anything else. */
export function srcsetOf(src: string | null | undefined): string | null {
    if (!src) return null;
    const at = src.indexOf(UPLOADS);
    // Only the site's own uploads: a relative path or this site's absolute URL.
    if (at < 0 || (at > 0 && !/^https?:\/\/[^/]+$/.test(src.slice(0, at)))) return null;
    const relative = src.slice(at + UPLOADS.length).split(/[?#]/)[0];
    if (!PHOTO.test(relative)) return null;
    const encoded = encodePath(relative);
    return WIDTHS.map(width => `/img/${width}/${encoded} ${width}w`).join(', ');
}

/**
 * Adds srcset/sizes to the photos of CMS HTML (prose, tables). Images that already carry
 * a srcset are left alone. `sizes` is the width of the text column.
 */
export function withSrcset(html: string, sizes: string): string {
    if (!html.includes('<img')) return html;
    return html.replace(/<img\b([^>]*)>/gi, (tag, attrs: string) => {
        if (/\ssrcset\s*=/i.test(attrs)) return tag;
        const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
        const srcset = srcsetOf(src?.[1] ?? src?.[2]);
        if (!srcset) return tag;
        const lazy = /\sloading\s*=/i.test(attrs) ? '' : ' loading="lazy"';
        return `<img${attrs.replace(/\s*\/$/, '')} srcset="${srcset}" sizes="${sizes}"${lazy}>`;
    });
}

/** `[attr.srcset]="photo.src | srcset"` – null leaves the attribute out. */
@Pipe({ name: 'srcset' })
export class SrcsetPipe implements PipeTransform {
    transform(src: string | null | undefined): string | null {
        return srcsetOf(src);
    }
}
