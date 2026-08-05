/** Formats a canonical tag for display without changing the stored value. */
export function formatTagLabel(tag: string): string {
  return tag
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}
