export type CustomDetailSection = {
  id: string
  label: string
  body: string
}

export function generateCustomDetailId(): string {
  return `d_${Math.random().toString(36).slice(2, 10)}`
}

// Drops rows missing a label or body rather than persisting them
// half-filled; trims whitespace from what's kept. Order is preserved --
// array order is display order, there's no separate ordering field.
export function sanitizeCustomDetails(sections: CustomDetailSection[]): CustomDetailSection[] {
  return sections
    .map((section) => ({ id: section.id, label: section.label.trim(), body: section.body.trim() }))
    .filter((section) => section.label.length > 0 && section.body.length > 0)
}
