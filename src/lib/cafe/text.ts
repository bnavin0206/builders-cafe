/** Free text from the attendee: trimmed, one line, at most 80 characters. */
export function cleanText(text: string, max = 80): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}
