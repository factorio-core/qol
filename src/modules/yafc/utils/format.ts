import type { LocalisedString } from 'factorio:runtime';

/** Formats a numeric value with up to 2 decimal places, trimming trailing zeros. */
export function formatAmount(amount: number): string {
  if (amount === Math.floor(amount)) {
    return tostring(amount);
  }
  const [formatted] = string.gsub(string.format('%.2f', amount), '0+$', '');
  const [cleaned] = string.gsub(formatted, '%.$', '');
  return cleaned;
}

/** Formats power in Watts into human-readable metric units (W, kW, MW, GW, TW). */
export function formatPower(watts: number): string {
  const abs = Math.abs(watts);
  if (abs >= 1e12) {
    return `${formatAmount(watts / 1e12)} TW`;
  }
  if (abs >= 1e9) {
    return `${formatAmount(watts / 1e9)} GW`;
  }
  if (abs >= 1e6) {
    return `${formatAmount(watts / 1e6)} MW`;
  }
  if (abs >= 1e3) {
    return `${formatAmount(watts / 1e3)} kW`;
  }
  return `${string.format('%.0f', watts)} W`;
}

/** Formats a flow rate with sign and unit (e.g. "+12.50/s", "-3.00/s", "0.0/s"). */
export function formatRate(rate: number): string {
  if (Math.abs(rate) < 0.001) return '0.0/s';
  const prefix = rate > 0 ? '+' : '';
  return `${prefix}${string.format('%.2f', rate)}/s`;
}

/** Formats fluid temperature into a compact string with metric prefixes (k, M, G). */
export function formatTemperature(temp: number): string {
  const abs = Math.abs(temp);
  const sign = temp < 0 ? '-' : '';

  if (abs >= 1e9) {
    const val = abs / 1e9;
    const formatted = val >= 10 || val === Math.floor(val) ? string.format('%.0f', val) : string.format('%.1f', val);
    return `${sign}${formatted}G°`;
  }
  if (abs >= 1e6) {
    const val = abs / 1e6;
    const formatted = val >= 10 || val === Math.floor(val) ? string.format('%.0f', val) : string.format('%.1f', val);
    return `${sign}${formatted}M°`;
  }
  if (abs >= 1e3) {
    const val = abs / 1e3;
    const formatted = val >= 10 || val === Math.floor(val) ? string.format('%.0f', val) : string.format('%.1f', val);
    return `${sign}${formatted}k°`;
  }
  return `${string.format('%.0f', temp)}°`;
}

/** Combines localised strings into nested tables respecting Factorio's 20-parameter limit. */
export function combineLocalisedStrings(rawItems: (string | number | LocalisedString)[]): LocalisedString {
  // 1. Merge consecutive string/number primitives to minimize parameter count
  const flattened: (string | number | LocalisedString)[] = [];
  let currentString: string | undefined;

  for (const item of rawItems) {
    if (typeof item === 'string' || typeof item === 'number') {
      const str = tostring(item);
      if (currentString !== undefined) {
        currentString += str;
      } else {
        currentString = str;
      }
    } else {
      if (currentString !== undefined) {
        flattened.push(currentString);
        currentString = undefined;
      }
      flattened.push(item);
    }
  }

  if (currentString !== undefined) {
    flattened.push(currentString);
  }

  if (flattened.length === 0) {
    return '';
  }

  if (flattened.length <= 15) {
    return ['', ...flattened] as LocalisedString;
  }

  // 2. Chunk into nested arrays of at most 15 elements per table
  const chunks: LocalisedString[] = [];
  let currentChunk: (string | number | LocalisedString)[] = [''];

  for (const item of flattened) {
    currentChunk.push(item);
    if (currentChunk.length >= 16) {
      chunks.push(currentChunk as LocalisedString);
      currentChunk = [''];
    }
  }

  if (currentChunk.length > 1) {
    chunks.push(currentChunk as LocalisedString);
  }

  if (chunks.length <= 15) {
    return ['', ...chunks] as LocalisedString;
  }

  return combineLocalisedStrings(chunks);
}
