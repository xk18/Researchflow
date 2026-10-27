import { useEffect, useState } from "react";
// Calendar dates, not UTC instants. Only component ordinals use UTC to avoid DST.
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1900 || y > 2199 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function dayNumber(date: string): number {
  // Boundary month grids include adjacent-year cells; persisted dates remain bounded.
  if (
    !validDate(date) &&
    !(
      /^(1899|2200)-\d{2}-\d{2}$/.test(date) &&
      validDate(String(date).replace(/^\d{4}/, "2000"))
    )
  )
    throw new Error("日期无效，请使用 1900–2199 年的 YYYY-MM-DD 日期。");
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}
export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function shiftMonth(date: string, delta: number): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
}
export function daysUntil(
  target?: string,
  today = localDate(),
): number | undefined {
  return target && validDate(target)
    ? dayNumber(target) - dayNumber(today)
    : undefined;
}
export function dueLabel(target?: string, today = localDate()): string {
  const days = daysUntil(target, today);
  return days === undefined
    ? ""
    : days === 0
      ? "今天到期"
      : days > 0
        ? `距目标日期还有 ${days} 天`
        : `已超过计划日期 ${-days} 天`;
}
export function includesDay(start: string, end: string, date: string) {
  return start <= date && date <= end;
}
export function overlaps(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
) {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}
export function monthWeeks(month: string): string[][] {
  const first = month.slice(0, 7) + "-01",
    last = addDays(shiftMonth(first, 1), -1);
  const weekday = new Date(dayNumber(first) * 86400000).getUTCDay();
  const start = addDays(first, -((weekday + 6) % 7)),
    days = dayNumber(last) - dayNumber(start) + 1;
  return Array.from({ length: Math.ceil(days / 7) }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
  );
}
export function useToday() {
  const [today, setToday] = useState(localDate);
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timeout);
      setToday(localDate());
      const now = new Date();
      const next = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      timeout = setTimeout(update, next.getTime() - now.getTime() + 50);
    };
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return today;
}
