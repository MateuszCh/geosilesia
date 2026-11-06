/**
 * Lower-cases and strips diacritics, so "kamieniol" matches "Kamieniołom".
 * "ł" has no Unicode decomposition and is mapped by hand.
 */
export function foldText(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[łŁ]/g, 'l')
        .toLowerCase();
}
