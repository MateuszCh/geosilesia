/**
 * Album categories of the gallery and their trail colours. `slug` names the category in the
 * album list's address: "/geosilesia-galeria?kategoria=inne".
 */
export const ALBUM_CATEGORIES = [
    { key: 'dziedzictwo ziemi', slug: 'dziedzictwo-ziemi', label: 'Dziedzictwo Ziemi', color: 'var(--trail-green)' },
    { key: 'dziedzictwo geokulturowe', slug: 'dziedzictwo-geokulturowe', label: 'Dziedzictwo geokulturowe', color: 'var(--trail-blue)' },
    { key: 'inne', slug: 'inne', label: 'Inne', color: 'var(--trail-yellow)' }
] as const;

/** The query parameter of the album list that picks a category. */
export const ALBUM_CATEGORY_PARAM = 'kategoria';

export function albumCategoryBySlug(slug: string | null | undefined) {
    return ALBUM_CATEGORIES.find(category => category.slug === slug);
}

export function albumCategory(value: string | undefined) {
    const key = (value ?? '').trim().toLowerCase();
    return ALBUM_CATEGORIES.find(category => category.key === key);
}
