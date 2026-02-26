/**
 * Highlights [PLACEHOLDER] tokens in text with styled spans.
 * Returns HTML string for use with v-html.
 */
export function highlightPlaceholders(text: string): string {
  // Escape HTML entities first
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return escaped.replace(
    /\[([A-Z][A-Z0-9\s_/\-]+)\]/g,
    '<span class="inline-block px-1.5 py-0.5 bg-indigo-100 text-indigo-700 font-semibold rounded text-xs">[&nbsp;$1&nbsp;]</span>'
  )
}
