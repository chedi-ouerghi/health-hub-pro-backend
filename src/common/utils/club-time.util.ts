/**
 * Medical scheduling time utilities.
 * Handles "HH:mm" ↔ Date conversion, slot overlap detection,
 * and checks whether a given DateTime falls within an Availability window.
 */

/**
 * Parse "HH:mm" string into { hours, minutes }.
 */
export function parseHhmm(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time format: ${time} — expected HH:mm`);
  }
  return { hours: h, minutes: m };
}

/**
 * Convert an "HH:mm" string to total minutes since midnight.
 */
export function hhmmToMinutes(time: string): number {
  const { hours, minutes } = parseHhmm(time);
  return hours * 60 + minutes;
}

/**
 * Convert total minutes since midnight back to "HH:mm" string.
 */
export function minutesToHhmm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Check whether two time windows [startA, endA) and [startB, endB) overlap.
 * Times are "HH:mm" strings.
 */
export function timesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  const sa = hhmmToMinutes(startA);
  const ea = hhmmToMinutes(endA);
  const sb = hhmmToMinutes(startB);
  const eb = hhmmToMinutes(endB);
  // Overlaps when one range starts before the other ends
  return sa < eb && ea > sb;
}

/**
 * Build a Date object for a given "HH:mm" time on the same calendar day as
 * `referenceDate`, keeping the reference's date (year/month/day) and replacing
 * the time portion.
 */
export function buildDateFromHhmm(referenceDate: Date, time: string): Date {
  const { hours, minutes } = parseHhmm(time);
  const d = new Date(referenceDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/**
 * Extract the "HH:mm" representation of a Date's local time.
 */
export function dateToHhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Determine whether `scheduledAt` falls inside the availability window
 * [startTime, endTime) and aligns with the slotMinutes grid.
 *
 * @param scheduledAt   - The appointment datetime (UTC)
 * @param dayOfWeek     - Expected day (0=Sunday … 6=Saturday, JS convention)
 * @param startTime     - Availability start "HH:mm"
 * @param endTime       - Availability end   "HH:mm"
 * @param slotMinutes   - Slot size in minutes (e.g. 30)
 */
export function isWithinAvailability(
  scheduledAt: Date,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  slotMinutes: number,
): boolean {
  if (scheduledAt.getDay() !== dayOfWeek) return false;

  const apptMinutes = scheduledAt.getHours() * 60 + scheduledAt.getMinutes();
  const start = hhmmToMinutes(startTime);
  const end = hhmmToMinutes(endTime);

  if (apptMinutes < start || apptMinutes >= end) return false;

  // Must align to slot boundary
  const offset = apptMinutes - start;
  return offset % slotMinutes === 0;
}

/**
 * Map Prisma's DayOfWeek enum string to JS Date.getDay() value (0=Sunday).
 */
export const PRISMA_DAY_TO_JS: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

/**
 * Map JS Date.getDay() (0=Sunday) to Prisma DayOfWeek enum string.
 */
export const JS_DAY_TO_PRISMA: Record<number, string> = Object.fromEntries(
  Object.entries(PRISMA_DAY_TO_JS).map(([k, v]) => [v, k]),
);
