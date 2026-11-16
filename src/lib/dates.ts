/** All dates are ISO YYYY-MM-DD strings handled in UTC so results never depend on server timezone. */
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const parse = (s: string) => new Date(s.length === 7 ? `${s}-01T00:00:00Z` : `${s}T00:00:00Z`);
export const today = () => iso(new Date());

export function addDays(s: string, n: number) { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
export function addMonths(s: string, n: number) { const d = parse(s); d.setUTCMonth(d.getUTCMonth() + n); return iso(d); }
export function addYears(s: string, n: number) { return addMonths(s, n * 12); }
export function monthsBetween(a: string, b: string) {
  const x = parse(a), y = parse(b);
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth());
}
export function fmt(s?: string | null) {
  if (!s) return "—";
  return parse(s.slice(0, 10)).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function nthWeekday(year: number, month: number, weekday: number, n: number) {
  const d = new Date(Date.UTC(year, month, 1));
  const shift = (weekday - d.getUTCDay() + 7) % 7;
  return iso(new Date(Date.UTC(year, month, 1 + shift + (n - 1) * 7)));
}
function lastWeekday(year: number, month: number, weekday: number) {
  const d = new Date(Date.UTC(year, month + 1, 0));
  const shift = (d.getUTCDay() - weekday + 7) % 7;
  return iso(new Date(Date.UTC(year, month + 1, -shift)));
}
export function federalHolidays(year: number): string[] {
  const fixed = [[0, 1], [5, 19], [6, 4], [10, 11], [11, 25]].map(([m, d]) => {
    const dt = new Date(Date.UTC(year, m, d));
    // observed: Saturday -> Friday, Sunday -> Monday
    if (dt.getUTCDay() === 6) dt.setUTCDate(d - 1);
    if (dt.getUTCDay() === 0) dt.setUTCDate(d + 1);
    return iso(dt);
  });
  return [
    ...fixed,
    nthWeekday(year, 0, 1, 3), nthWeekday(year, 1, 1, 3), lastWeekday(year, 4, 1),
    nthWeekday(year, 8, 1, 1), nthWeekday(year, 9, 1, 2), nthWeekday(year, 10, 4, 4),
  ];
}
export function isBusinessDay(s: string) {
  const d = parse(s);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !federalHolidays(d.getUTCFullYear()).includes(s);
}
/** Date of the Nth business day AFTER the given date. */
export function addBusinessDays(s: string, n: number) {
  let cur = s;
  while (n > 0) { cur = addDays(cur, 1); if (isBusinessDay(cur)) n--; }
  return cur;
}
