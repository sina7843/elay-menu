// Stall opening rules. All clock math is in Asia/Tehran local time.
import type { WeeklySchedule } from './schemas.js';
import { addDays, tehranInstant, tehranParts } from './time.js';

export interface Override {
  state: 'open' | 'closed';
  /** Next scheduled opening start when set; null = no future opening existed, persists until changed. */
  until: Date | null;
}

const toMinutes = (t: string) => (t === '24:00' ? 1440 : Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));

/** Whether the weekly schedule says open at `at`, including yesterday's past-midnight interval. */
export function isScheduledOpen(week: WeeklySchedule, at: Date): boolean {
  const { minutes, weekday } = tehranParts(at);
  const today = week[weekday]!;
  if (!today.closed) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    if (close > open ? minutes >= open && minutes < close : minutes >= open) return true;
  }
  const yesterday = week[(weekday + 6) % 7]!;
  return !yesterday.closed && toMinutes(yesterday.close) < toMinutes(yesterday.open) && minutes < toMinutes(yesterday.close);
}

/** Start of the next scheduled interval strictly after `at`, or null when every day is closed. */
export function nextOpeningStart(week: WeeklySchedule, at: Date): Date | null {
  const { date, weekday } = tehranParts(at);
  for (let k = 0; k <= 7; k++) {
    const day = week[(weekday + k) % 7]!;
    if (day.closed) continue;
    const start = tehranInstant(addDays(date, k), toMinutes(day.open));
    if (start > at) return start;
  }
  return null;
}

/** End of the scheduled interval containing `at` (today's, or yesterday's past-midnight one), else null. */
export function scheduledIntervalEnd(week: WeeklySchedule, at: Date): Date | null {
  const { date, minutes, weekday } = tehranParts(at);
  const today = week[weekday]!;
  if (!today.closed) {
    const open = toMinutes(today.open);
    const close = toMinutes(today.close);
    if (close > open && minutes >= open && minutes < close) return tehranInstant(date, close);
    if (close < open && minutes >= open) return tehranInstant(addDays(date, 1), close);
  }
  const yesterday = week[(weekday + 6) % 7]!;
  const yClose = toMinutes(yesterday.close);
  if (!yesterday.closed && yClose < toMinutes(yesterday.open) && minutes < yClose) return tehranInstant(date, yClose);
  return null;
}

const isActive = (o: Override | null, at: Date): o is Override => !!o && (o.until === null || at < o.until);

export interface StallStatus {
  isOpen: boolean;
  /** When closed: next opening, or null when none is scheduled. */
  opensAt: Date | null;
  /** When open: when the current opening ends, or null when unknown (open override with no end). */
  closesAt: Date | null;
}

export function stallStatus(week: WeeklySchedule, override: Override | null, at: Date): StallStatus {
  const active = isActive(override, at);
  const isOpen = active ? override.state === 'open' : isScheduledOpen(week, at);
  if (isOpen) {
    // An "open" override hands over to the schedule at `until`, which then runs to its own end.
    const closesAt = active ? (override.until ? scheduledIntervalEnd(week, override.until) : null) : scheduledIntervalEnd(week, at);
    return { isOpen, opensAt: null, closesAt };
  }
  return { isOpen, opensAt: active && override.until ? override.until : nextOpeningStart(week, at), closesAt: null };
}

/**
 * The "open now" switch in the stall panel: inverts the scheduled state until the next scheduled
 * opening start. Choosing the state the schedule already has clears the override.
 */
export function overrideFor(week: WeeklySchedule, wantOpen: boolean, at: Date): Override | null {
  if (isScheduledOpen(week, at) === wantOpen) return null;
  return { state: wantOpen ? 'open' : 'closed', until: nextOpeningStart(week, at) };
}

/**
 * After an hours edit an active override is recomputed against the new schedule: dropped when the
 * schedule now agrees with it, otherwise re-anchored to the new next opening start.
 */
export function reanchorOverride(week: WeeklySchedule, override: Override | null, at: Date): Override | null {
  return isActive(override, at) ? overrideFor(week, override.state === 'open', at) : null;
}
