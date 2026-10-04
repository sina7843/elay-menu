// Panel input/output helpers. Dates are entered and shown in Jalali; the API stores ISO Tehran dates.
import { addDays, fromJalali, normalizeFa, tehranDate, toJalali } from '@elay/shared';
import { fa } from '../customer/format';

const pad = (n: number) => String(n).padStart(2, '0');
const toFaDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);

/** "2026-10-04" → "۱۴۰۵/۰۷/۱۲" */
export function jalaliText(iso: string) {
  const j = toJalali(iso);
  return toFaDigits(`${j.year}/${pad(j.month)}/${pad(j.day)}`);
}

/** "۱۴۰۵/۷/۱۲", "1405-07-12" … → ISO date, or null when it is not a real Jalali date. */
export function parseJalali(text: string): string | null {
  const m = normalizeFa(text).trim().match(/^(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})$/);
  if (!m) return null;
  try {
    return fromJalali({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) });
  } catch {
    return null;
  }
}

/** Digits in either script, «٬» or «,» separators → integer, or null. */
export function parseInteger(text: string): number | null {
  const s = normalizeFa(text).replace(/[٬,\s]/g, '');
  return /^\d{1,10}$/.test(s) ? Number(s) : null;
}

export const today = () => tehranDate(new Date());
export const inDays = (n: number) => addDays(today(), n);

const weekday = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Short human date for tags: the weekday within the coming week, else «۱۸ مهر». */
export function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const days = (d.getTime() - new Date(`${today()}T00:00:00Z`).getTime()) / 86_400_000;
  return days >= 0 && days < 7 ? weekday.format(d) : dayMonth.format(d);
}

export { fa };
