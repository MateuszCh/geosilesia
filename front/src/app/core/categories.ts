import { IconPostData, TrailColorName } from '../models/post.model';

/**
 * Colours of the design system, by the names the CMS offers in its select fields. Hex
 * values rather than CSS variables, because map pins are drawn outside the page's CSS.
 */
export const TRAIL_COLORS: Record<TrailColorName, string> = {
    czerwony: '#c8202a',
    zielony: '#2d8a3e',
    niebieski: '#1d5fbf',
    czarny: '#18201b',
    brązowy: '#7a4a1e',
    turkusowy: '#1c7c74',
    fioletowy: '#6b3fa0',
    żółty: '#f2c200',
    pomarańczowy: '#d9741a',
    różowy: '#b0306a'
};

/** Fallback for a missing or unknown colour – neutral, never mistaken for a category. */
export const NEUTRAL_COLOR = '#4f5a53';

/** Ten category glyphs of the "Ikony" asset group: 24×24, single stroke. */
export const CATEGORY_GLYPHS = {
    geologiczne: 'M3 7h18M3 12h18M3 17h18M7 7l2 5M15 12l-2 5M17 7l1 5',
    geomorfologiczne: 'M2 20l7-12 4 6 3-4 6 10z',
    wodne: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
    poprzemyslowe: 'M6 21l4-14h4l4 14M8 14h8M7 18h10M12 7V5M9 5a3 3 0 0 1 6 0',
    podziemne: 'M3 21v-9a9 9 0 0 1 18 0v9M7 21v-8a5 5 0 0 1 10 0v8M2 21h20',
    uzdrowiska: 'M4 20V8h16v12M4 12h16M4 16h16M8 8V5M16 8V5M2 20h20',
    muzea: 'M3 10l9-6 9 6M5 10v9M9.5 10v9M14.5 10v9M19 10v9M3 21h18',
    szlaki: 'M6 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM18 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
    widokowe: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
    wydarzenia: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4'
} as const;

export type GlyphName = keyof typeof CATEGORY_GLYPHS;

/**
 * Front-end fallback until the `icon` posts get their `color` field: keyed by the
 * internal `category` key, which markers refer to and which does not always match the
 * category name ("Obiekty wodne" is "geostanowiska międzynarodowe").
 */
const BY_CATEGORY_KEY: Record<string, { color: TrailColorName; glyph: GlyphName }> = {
    'geostanowiska projektowane': { color: 'czerwony', glyph: 'geologiczne' },
    'geostanowiska inne': { color: 'zielony', glyph: 'geomorfologiczne' },
    'geostanowiska międzynarodowe': { color: 'niebieski', glyph: 'wodne' },
    'obiekty poprzemysłowe': { color: 'czarny', glyph: 'poprzemyslowe' },
    'trasy podziemne': { color: 'brązowy', glyph: 'podziemne' },
    'uzdrowiska i obiekty lecznicze': { color: 'turkusowy', glyph: 'uzdrowiska' },
    'muzea, ośrodki edukacyjne i dinoparki': { color: 'fioletowy', glyph: 'muzea' },
    'ścieżki tematyczne': { color: 'żółty', glyph: 'szlaki' },
    'punkty widokowe': { color: 'pomarańczowy', glyph: 'widokowe' },
    'imprezy tematyczne': { color: 'różowy', glyph: 'wydarzenia' }
};

/** The glyph follows the colour when the key is unknown – the pairs are fixed in the design system. */
const GLYPH_BY_COLOR: Record<TrailColorName, GlyphName> = {
    czerwony: 'geologiczne',
    zielony: 'geomorfologiczne',
    niebieski: 'wodne',
    czarny: 'poprzemyslowe',
    brązowy: 'podziemne',
    turkusowy: 'uzdrowiska',
    fioletowy: 'muzea',
    żółty: 'szlaki',
    pomarańczowy: 'widokowe',
    różowy: 'wydarzenia'
};

export function colorByName(name: string | undefined): string | undefined {
    return name ? TRAIL_COLORS[name.trim().toLowerCase() as TrailColorName] : undefined;
}

export interface CategoryLook {
    color: string;
    /** Inline glyph path; used when the post has no uploaded `line_icon`. */
    glyph?: string;
    /** Uploaded SVG from the CMS; takes precedence over the built-in glyph. */
    iconUrl?: string;
}

/** Colour and glyph of a map category: the CMS fields first, the key map as a fallback. */
export function categoryLook(icon: IconPostData | undefined): CategoryLook {
    const byKey = icon?.category ? BY_CATEGORY_KEY[icon.category.trim().toLowerCase()] : undefined;
    const colorName = (icon?.color?.trim().toLowerCase() as TrailColorName | undefined) ?? byKey?.color;
    const color = colorByName(colorName) ?? NEUTRAL_COLOR;
    const glyphName = byKey?.glyph ?? (colorName ? GLYPH_BY_COLOR[colorName] : undefined);
    return {
        color,
        glyph: glyphName ? CATEGORY_GLYPHS[glyphName] : undefined,
        iconUrl: icon?.line_icon || undefined
    };
}

/**
 * Colours of geological periods (International Chronostratigraphic Chart), matched by the
 * period name in the first column of a table. Used as a small swatch, never as text.
 */
const PERIOD_COLORS: [RegExp, string][] = [
    [/prekambr|proterozoik|archaik/i, '#f74370'],
    [/kambr/i, '#7fa056'],
    [/ordowik/i, '#009270'],
    [/sylur/i, '#b3e1b6'],
    [/dewon/i, '#cb8c37'],
    [/karbon/i, '#67a599'],
    [/perm/i, '#f04028'],
    [/trias/i, '#812b92'],
    [/jura/i, '#34b2c9'],
    [/kred/i, '#7fc64e'],
    [/paleogen/i, '#fd9a52'],
    [/neogen/i, '#ffe619'],
    [/czwartorz/i, '#f9f97f']
];

export function periodColor(text: string | undefined): string | undefined {
    if (!text) return undefined;
    return PERIOD_COLORS.find(([pattern]) => pattern.test(text))?.[1];
}
