function toDate(input: Date | string | null): Date | null {
  if (input == null) return null;
  return input instanceof Date ? input : new Date(input);
}

export function formatTime(input: Date | string | null): string {
  const d = toDate(input);
  if (!d) return '';
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return minutes === 0
    ? `${hours} ${period}`
    : `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function formatTimeRange(
  start: Date | string | null,
  end: Date | string | null,
): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s) return '';
  if (!e) return formatTime(s);
  const sPeriod = s.getHours() >= 12 ? 'PM' : 'AM';
  const ePeriod = e.getHours() >= 12 ? 'PM' : 'AM';
  if (sPeriod === ePeriod) {
    const sFmt = formatTime(s).replace(` ${sPeriod}`, '');
    return `${sFmt}-${formatTime(e)}`;
  }
  return `${formatTime(s)} - ${formatTime(e)}`;
}
