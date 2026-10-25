/** Album categories of the gallery and their trail colours. */
export const ALBUM_CATEGORIES = [
    { key: 'dziedzictwo ziemi', label: 'Dziedzictwo Ziemi', color: 'var(--trail-green)' },
    { key: 'dziedzictwo geokulturowe', label: 'Dziedzictwo geokulturowe', color: 'var(--trail-blue)' },
    { key: 'inne', label: 'Inne', color: 'var(--trail-yellow)' }
] as const;

export function albumCategory(value: string | undefined) {
    const key = (value ?? '').trim().toLowerCase();
    return ALBUM_CATEGORIES.find(category => category.key === key);
}
