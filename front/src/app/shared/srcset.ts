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

/** The photo's path under /uploads, encoded – null when it is not one of the site's photos. */
function uploadPath(src: string | null | undefined): string | null {
    if (!src) return null;
    const at = src.indexOf(UPLOADS);
    // Only the site's own uploads: a relative path or this site's absolute URL.
    if (at < 0 || (at > 0 && !/^https?:\/\/[^/]+$/.test(src.slice(0, at)))) return null;
    const relative = src.slice(at + UPLOADS.length).split(/[?#]/)[0];
    return PHOTO.test(relative) ? encodePath(relative) : null;
}

/** "…/img/400/a.jpg 400w, …" for a photo from /uploads, null for anything else. */
export function srcsetOf(src: string | null | undefined): string | null {
    const encoded = uploadPath(src);
    return encoded && WIDTHS.map(width => `/img/${width}/${encoded} ${width}w`).join(', ');
}

/**
 * Frames the server can cut a photo to (FRAMES in images.js): only the part a box with
 * `object-fit: cover` shows. The value is the widest box, in CSS px, the frame covers.
 */
export const FRAMES = { 'hero-phone': { maxWidth: 430 } } as const;

/** Per cent 0–100 from a CMS position ("40", 40, "" → 50 = centre). */
function percent(value: number | string | null | undefined): number {
    const number = Math.round(Number.parseFloat(String(value ?? '')));
    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 50;
}

/**
 * srcset of a photo cut to `frame` around object-position `x`% `y`%: the same pixels the
 * box would show from the whole photo, without the sides it never shows.
 */
export function framedSrcsetOf(
    src: string | null | undefined,
    frame: keyof typeof FRAMES,
    x?: number | string | null,
    y?: number | string | null
): string | null {
    const encoded = uploadPath(src);
    const position = `${percent(x)}-${percent(y)}`;
    return encoded && WIDTHS.map(width => `/img/${frame}/${position}/${width}/${encoded} ${width}w`).join(', ');
}

/**
 * Adds srcset/sizes to the photos of CMS HTML (prose, tables). Images that already carry
 * a srcset are left alone. `sizes` is the width of the text column. `held` writes the
 * addresses to data-held-src / data-held-srcset instead (PhotoHold, photo-hold.ts).
 */
export function withSrcset(html: string, sizes: string, held = false): string {
    if (!html.includes('<img')) return html;
    return html.replace(/<img\b([^>]*)>/gi, (tag, attrs: string) => {
        if (/\ssrcset\s*=/i.test(attrs)) return tag;
        const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
        const srcset = srcsetOf(src?.[1] ?? src?.[2]);
        if (!srcset) return tag;
        const lazy = /\sloading\s*=/i.test(attrs) ? '' : ' loading="lazy"';
        const rest = attrs.replace(/\s*\/$/, '');
        if (held) {
            const heldRest = rest.replace(/\ssrc\s*=/i, ' data-held-src=');
            return `<img${heldRest} data-held-srcset="${srcset}" sizes="${sizes}"${lazy}>`;
        }
        return `<img${rest} srcset="${srcset}" sizes="${sizes}"${lazy}>`;
    });
}

/** `[attr.srcset]="photo.src | srcset"` – null leaves the attribute out. */
@Pipe({ name: 'srcset' })
export class SrcsetPipe implements PipeTransform {
    transform(src: string | null | undefined): string | null {
        return srcsetOf(src);
    }
}
