/**
 * Dates from the CMS: ms, ISO strings, "dd.mm.rrrr" strings or Dates. Calendar fields are
 * read in Polish time, so the server render (UTC) and the browser show the same day.
 */

export interface DateParts {
    day: number;
    /** 1–12 */
    month: number;
    year: number;
}

export const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

const FORMAT = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric'
});

export function toDate(value: string | number | Date | undefined | null): Date | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
    if (typeof value === 'string') {
        const polish = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim());
        if (polish) {
            // Noon, so the time zone cannot move it to another day.
            return new Date(Date.UTC(+polish[3], +polish[2] - 1, +polish[1], 12));
        }
        if (/^\d+$/.test(value)) return toDate(Number(value));
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

export function dateParts(value: string | number | Date | undefined | null): DateParts | undefined {
    const date = toDate(value);
    if (!date) return undefined;
    const parts = FORMAT.formatToParts(date);
    const get = (type: string) => Number(parts.find(part => part.type === type)?.value);
    return { day: get('day'), month: get('month'), year: get('year') };
}

const pad = (value: number) => String(value).padStart(2, '0');

/** dd.mm.rrrr */
export function formatDate(value: string | number | Date | undefined | null): string | undefined {
    const parts = dateParts(value);
    return parts ? `${pad(parts.day)}.${pad(parts.month)}.${parts.year}` : undefined;
}
