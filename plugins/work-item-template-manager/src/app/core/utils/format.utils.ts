const BYTE_UNITS: [number, string, 'long' | 'short'][] = [
  [1000 ** 5, 'petabyte', 'short'],
  [1000 ** 4, 'terabyte', 'short'],
  [1000 ** 3, 'gigabyte', 'short'],
  [1000 ** 2, 'megabyte', 'short'],
  [1000, 'kilobyte', 'short'],
  [1, 'byte', 'long'],
];

/** Formats a byte count like SystemLink's Nimble byte unit (1000-based, one decimal digit). */
export function formatByteSize(bytes: number, locale: string): string {
  const [scale, unit, unitDisplay] =
    BYTE_UNITS.find(([factor]) => Math.abs(bytes) >= factor) ?? BYTE_UNITS[BYTE_UNITS.length - 1];
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay,
    maximumFractionDigits: 1,
  }).format(bytes / scale);
}
