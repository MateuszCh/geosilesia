/**
 * Polish plural forms: 1 album, 2–4 albumy, 5+ albumów (but 12–14 albumów).
 * `plural(3, 'miejsce', 'miejsca', 'miejsc')` → "miejsca".
 */
export function plural(count: number, one: string, few: string, many: string): string {
    if (count === 1) return one;
    const last = count % 10;
    const lastTwo = count % 100;
    return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}
