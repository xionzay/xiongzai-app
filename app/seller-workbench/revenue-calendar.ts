// UTC arithmetic keeps calendar days stable across device timezones and DST.
export function calendarDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}
export function shiftCalendarDate(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  return calendarDate(year, month - 1, day + days);
}
export function shiftCalendarMonth(value: string, delta: number) {
  const [year, month, day] = value.split('-').map(Number);
  const last = new Date(Date.UTC(year, month + delta, 0)).getUTCDate();
  return calendarDate(year, month - 1 + delta, Math.min(day, last));
}
export function calendarDays(month: string) {
  const [year, number] = month.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((weekday + count) / 7) * 7 }, (_, index) => calendarDate(year, number - 1, index - weekday + 1));
}
export function calendarAllowed(value: string, min: string, max: string) {
  return value >= min && value <= max;
}
