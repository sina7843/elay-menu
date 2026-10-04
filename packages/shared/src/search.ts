// Persian-aware text matching shared by the API and (for offline use) the web client.

const DIGITS = /[۰-۹٠-٩]/g;

/** Unifies ی/ي/ى and ک/ك, drops diacritics, tatweel and zero-width joiners, maps digits to ASCII, lowercases. */
export function normalizeFa(text: string): string {
  return text
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ً-ٰٟـ​-‏­]/g, '')
    .replace(DIGITS, (d) => String((d.charCodeAt(0) - (d >= '۰' ? 0x06f0 : 0x0660)) % 10))
    .toLowerCase();
}

/** Query → tokens. Empty array means "no text filter". */
export const searchTokens = (query: string) => normalizeFa(query).split(/\s+/).filter(Boolean);

/**
 * True when every token occurs in the combined fields. Spaces are removed on both sides, so
 * «سیب زمینی», «سیب‌زمینی» and «سیبزمینی» all match each other.
 */
export function matchesTokens(tokens: string[], ...fields: string[]): boolean {
  const hay = normalizeFa(fields.join(' ')).replace(/\s+/g, '');
  return tokens.every((t) => hay.includes(t));
}
