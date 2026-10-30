/** Turns a Markdown answer into text that sounds natural when read aloud. */
export function cleanForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' (code block skipped) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[*_~>]+/g, '')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3500);
}
