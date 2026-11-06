/**
 * Photo credit as shown under a photo: "R. Chybiorz" → "Fot. R. Chybiorz". A credit that
 * already starts with "Fot." or "Il." is kept as typed; no author gives "".
 */
export function photoCredit(author: string | undefined): string {
    const text = author?.trim() ?? '';
    if (!text) return '';
    return /^(fot|il)\./i.test(text) ? text : `Fot. ${text}`;
}
