// Tehran calendar/clock and Jalali conversion using the platform's Intl (ICU) data only.

export const TIME_ZONE = 'Asia/Tehran';
const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const tehranFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

export interface TehranParts {
  /** Local calendar date, ISO YYYY-MM-DD. */
  date: string;
  /** Minutes since local midnight. */
  minutes: number;
  /** 0 = Saturday … 6 = Friday (Iranian week). */
  weekday: number;
}

export function tehranParts(at: Date): TehranParts {
  const p = Object.fromEntries(tehranFmt.formatToParts(at).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday!),
  };
}

export const tehranDate = (at: Date) => tehranParts(at).date;

const utcOfDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
};

export function addDays(date: string, days: number): string {
  return new Date(utcOfDate(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Offset of Tehran from UTC in minutes at an instant. */
function offsetAt(ms: number): number {
  const p = tehranParts(new Date(ms));
  return (utcOfDate(p.date) + p.minutes * 60_000 - Math.floor(ms / 60_000) * 60_000) / 60_000;
}

/** Instant of a Tehran local date + minutes since midnight (1440 = next midnight). */
export function tehranInstant(date: string, minutes: number): Date {
  const wall = utcOfDate(date) + minutes * 60_000;
  const first = wall - offsetAt(wall) * 60_000;
  return new Date(wall - offsetAt(first) * 60_000);
}

// ---------- Jalali (Solar Hijri) ----------

export interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

const persianFmt = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

/** ISO date (YYYY-MM-DD) → Jalali date. */
export function toJalali(date: string): JalaliDate {
  const p = Object.fromEntries(persianFmt.formatToParts(new Date(utcOfDate(date))).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}

/** Jalali date → ISO date (YYYY-MM-DD). Throws RangeError for dates that do not exist. */
export function fromJalali({ year, month, day }: JalaliDate): string {
  if (![year, month, day].every(Number.isInteger) || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError('invalid Jalali date');
  }
  const dayOfYear = (month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30) + day - 1;
  // 1 Farvardin falls on 20/21 March; estimate, then correct by comparing back.
  let guess = new Date(Date.UTC(year + 621, 2, 21) + dayOfYear * DAY_MS).toISOString().slice(0, 10);
  for (let i = 0; i < 4; i++) {
    const j = toJalali(guess);
    const diff = (year - j.year) * 400 + (month - j.month) * 32 + (day - j.day);
    if (diff === 0) return guess;
    guess = addDays(guess, Math.sign(diff));
  }
  throw new RangeError('invalid Jalali date');
}
