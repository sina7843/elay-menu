import { describe, expect, it } from 'vitest';
import {
  activeDiscountPercent,
  fromJalali,
  isScheduledOpen,
  matchesTokens,
  normalizeFa,
  nextOpeningStart,
  overrideFor,
  priceOn,
  reanchorOverride,
  searchTokens,
  stallStatus,
  tehranDate,
  tehranInstant,
  tehranParts,
  toJalali,
  type WeeklySchedule,
} from './index.js';

const at = (iso: string) => new Date(iso);
const every = (open: string, close: string, closed = false): WeeklySchedule =>
  Array.from({ length: 7 }, () => ({ closed, open, close }));

describe('Tehran time', () => {
  it('splits the local day at 20:30 UTC (UTC+03:30) and reports the Iranian weekday', () => {
    expect(tehranParts(at('2026-10-04T20:29:00Z'))).toEqual({ date: '2026-10-04', minutes: 23 * 60 + 59, weekday: 1 }); // Sunday
    expect(tehranParts(at('2026-10-04T20:30:00Z'))).toEqual({ date: '2026-10-05', minutes: 0, weekday: 2 });
    expect(tehranInstant('2026-10-05', 0).toISOString()).toBe('2026-10-04T20:30:00.000Z');
    expect(tehranInstant('2026-10-04', 1440).toISOString()).toBe('2026-10-04T20:30:00.000Z');
  });

  it('converts Jalali both ways and rejects impossible dates', () => {
    expect(toJalali('2026-10-04')).toEqual({ year: 1405, month: 7, day: 12 });
    expect(fromJalali({ year: 1405, month: 7, day: 12 })).toBe('2026-10-04');
    expect(fromJalali({ year: 1405, month: 1, day: 1 })).toBe('2026-03-21');
    expect(fromJalali({ year: 1403, month: 12, day: 30 })).toBe('2025-03-20'); // leap year
    expect(() => fromJalali({ year: 1404, month: 12, day: 30 })).toThrow(RangeError);
    expect(() => fromJalali({ year: 1405, month: 7, day: 31 })).toThrow(RangeError);
    for (const iso of ['2025-01-01', '2026-03-20', '2026-03-21', '2026-12-31', '2027-03-21']) {
      expect(fromJalali(toJalali(iso))).toBe(iso);
    }
  });
});

describe('discount dates', () => {
  const d = { percent: 20, startDate: '2026-10-01', endDate: '2026-10-04' };
  it('is inclusive of the whole last Tehran day', () => {
    expect(activeDiscountPercent(d, tehranDate(at('2026-09-30T20:29:00Z')))).toBeNull();
    expect(activeDiscountPercent(d, tehranDate(at('2026-09-30T20:30:00Z')))).toBe(20);
    expect(activeDiscountPercent(d, tehranDate(at('2026-10-04T20:29:00Z')))).toBe(20);
    expect(activeDiscountPercent(d, tehranDate(at('2026-10-04T20:30:00Z')))).toBeNull();
    expect(priceOn(890_000, d, '2026-10-02')).toBe(712_000);
    expect(priceOn(890_000, d, '2026-10-05')).toBe(890_000);
    expect(priceOn(890_000, null, '2026-10-02')).toBe(890_000);
  });

  it('never raises the price when rounding non-round prices', () => {
    expect(priceOn(1_600, { ...d, percent: 1 }, '2026-10-02')).toBe(1_600);
    expect(priceOn(123_456, { ...d, percent: 10 }, '2026-10-02')).toBe(111_000);
  });
});

describe('schedules', () => {
  // Times below are Tehran local; 2026-10-04 is Sunday.
  const local = (date: string, hhmm: string) => tehranInstant(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));

  it('handles overnight intervals from the previous day', () => {
    const week = every('18:00', '02:00');
    expect(isScheduledOpen(week, local('2026-10-05', '01:00'))).toBe(true);
    expect(isScheduledOpen(week, local('2026-10-05', '02:00'))).toBe(false);
    expect(isScheduledOpen(week, local('2026-10-05', '17:59'))).toBe(false);
    expect(isScheduledOpen(week, local('2026-10-05', '23:00'))).toBe(true);
    expect(stallStatus(week, null, local('2026-10-05', '03:00')).opensAt).toEqual(local('2026-10-05', '18:00'));
  });

  it('reports when the current opening ends, including overnight and open overrides', () => {
    const night = every('18:00', '02:00');
    expect(stallStatus(night, null, local('2026-10-04', '20:00')).closesAt).toEqual(local('2026-10-05', '02:00'));
    expect(stallStatus(night, null, local('2026-10-05', '01:00')).closesAt).toEqual(local('2026-10-05', '02:00'));
    const day = every('12:00', '23:30');
    expect(stallStatus(day, null, local('2026-10-04', '13:00')).closesAt).toEqual(local('2026-10-04', '23:30'));
    const early = overrideFor(day, true, local('2026-10-04', '09:00'))!;
    expect(stallStatus(day, early, local('2026-10-04', '10:00')).closesAt).toEqual(local('2026-10-04', '23:30'));
    expect(stallStatus(every('12:00', '23:00', true), { state: 'open', until: null }, local('2026-10-04', '10:00')).closesAt).toBeNull();
  });

  it('only counts yesterday overnight when yesterday is open', () => {
    const week = every('18:00', '02:00');
    week[1] = { closed: true, open: '18:00', close: '02:00' }; // Sunday closed
    expect(isScheduledOpen(week, local('2026-10-05', '01:00'))).toBe(false); // Monday 01:00
  });

  it('treats 24:00 as end of day', () => {
    const week = every('00:00', '24:00');
    expect(isScheduledOpen(week, local('2026-10-04', '23:59'))).toBe(true);
    expect(isScheduledOpen(week, local('2026-10-05', '00:00'))).toBe(true);
  });

  it('manual override expires at the next scheduled opening start', () => {
    const week = every('12:00', '23:00');
    const set = local('2026-10-04', '20:00'); // open by schedule
    const o = overrideFor(week, false, set)!;
    expect(o).toEqual({ state: 'closed', until: local('2026-10-05', '12:00') });
    expect(stallStatus(week, o, local('2026-10-04', '21:00'))).toEqual({ isOpen: false, opensAt: local('2026-10-05', '12:00'), closesAt: null });
    expect(stallStatus(week, o, local('2026-10-05', '11:59')).isOpen).toBe(false);
    expect(stallStatus(week, o, local('2026-10-05', '12:00')).isOpen).toBe(true);
    // Choosing what the schedule already says clears the override.
    expect(overrideFor(week, true, set)).toBeNull();
    // Opening early: open now, ends when the schedule takes over.
    const early = overrideFor(week, true, local('2026-10-05', '09:00'))!;
    expect(early.until).toEqual(local('2026-10-05', '12:00'));
    expect(stallStatus(week, early, local('2026-10-05', '10:00')).isOpen).toBe(true);
  });

  it('hours edits drop overrides the new schedule agrees with and re-anchor the rest', () => {
    const before = every('18:00', '23:00');
    const o = overrideFor(before, true, local('2026-10-04', '15:00'))!; // opened early
    expect(o.until).toEqual(local('2026-10-04', '18:00'));
    // New hours already open at 15:00 → override dropped, so the stall closes at 18:00 as scheduled.
    expect(reanchorOverride(every('12:00', '18:00'), o, local('2026-10-04', '15:00'))).toBeNull();
    // New hours still closed now → kept, expiring at the new next opening.
    expect(reanchorOverride(every('16:00', '23:00'), o, local('2026-10-04', '15:00'))).toEqual({
      state: 'open',
      until: local('2026-10-04', '16:00'),
    });
    expect(reanchorOverride(before, o, local('2026-10-04', '18:30'))).toBeNull(); // expired
  });

  it('never invents an opening time when every day is closed', () => {
    const week = every('12:00', '23:00', true);
    expect(nextOpeningStart(week, at('2026-10-04T10:00:00Z'))).toBeNull();
    expect(stallStatus(week, null, at('2026-10-04T10:00:00Z'))).toEqual({ isOpen: false, opensAt: null, closesAt: null });
    const o = overrideFor(week, true, at('2026-10-04T10:00:00Z'))!;
    expect(o.until).toBeNull();
    expect(stallStatus(week, o, at('2027-01-01T10:00:00Z')).isOpen).toBe(true);
  });
});

describe('Persian search', () => {
  it('ignores ی/ي, ک/ك, ZWNJ, spaces and digit scripts', () => {
    expect(normalizeFa('كباب كوبيده')).toBe('کباب کوبیده');
    const tokens = searchTokens('سیب زمینی');
    expect(matchesTokens(tokens, 'سیب‌زمینی ویژه')).toBe(true);
    expect(matchesTokens(searchTokens('سیب‌زمینی'), 'سیب زمینی')).toBe(true);
    expect(matchesTokens(searchTokens('سوشی ۸'), 'سوشی کالیفرنیا 8 تکه')).toBe(true);
    expect(matchesTokens(searchTokens('پیتزا چیزو'), 'پیتزا پپرونی', '', 'پیتزا چیزو')).toBe(true);
    expect(matchesTokens(searchTokens('برگر'), 'پیتزا پپرونی')).toBe(false);
  });
});
