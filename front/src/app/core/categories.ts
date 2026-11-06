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

export function colorByName(name: string | undefined): string | undefined {
    return name ? TRAIL_COLORS[name.trim().toLowerCase() as TrailColorName] : undefined;
}

export interface CategoryLook {
    color: string;
    /** The category's icon file from the CMS (`icon` field) – an SVG line icon in variant C. */
    iconUrl?: string;
}

/**
 * Colour and icon of a map category, both from its `icon` post: the front end keeps no
 * colours or icons of its own, so the CMS is the only place to change them.
 */
export function categoryLook(icon: IconPostData | undefined): CategoryLook {
    return {
        color: colorByName(icon?.color) ?? NEUTRAL_COLOR,
        iconUrl: icon?.icon || undefined
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
