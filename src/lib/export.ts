import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import type { Source } from '../types';

export type ExportFormat = 'pdf' | 'txt' | 'md';

export type ExportMessage = {
  role: 'user' | 'model';
  content: string;
  attachments?: { name: string }[] | null;
  sources?: Source[] | null;
  created_at?: string;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const safeName = (t: string) => (t.replace(/[^\p{L}\p{N}\-_ ]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'turzam-chat');

export function toMarkdown(title: string, msgs: ExportMessage[]): string {
  const out: string[] = [`# ${title}`, '', `_Exported from Turzam AI on ${new Date().toLocaleDateString()}_`, ''];
  for (const m of msgs) {
    out.push(m.role === 'user' ? '## You' : '## Turzam', '');
    if (m.attachments?.length) out.push(`_Attached: ${m.attachments.map((a) => a.name).join(', ')}_`, '');
    out.push(m.content.trim(), '');
    if (m.sources?.length) {
      out.push('**Sources**', '');
      m.sources.forEach((s, i) => out.push(`${i + 1}. [${s.title}](${s.url})`));
      out.push('');
    }
  }
  return out.join('\n');
}

export function toText(title: string, msgs: ExportMessage[]): string {
  const out: string[] = [title, '='.repeat(Math.min(title.length, 60)), `Exported from Turzam AI on ${new Date().toLocaleDateString()}`, ''];
  for (const m of msgs) {
    out.push(m.role === 'user' ? 'YOU:' : 'TURZAM:');
    if (m.attachments?.length) out.push(`[Attached: ${m.attachments.map((a) => a.name).join(', ')}]`);
    out.push(m.content.trim(), '');
    if (m.sources?.length) {
      out.push('Sources:');
      m.sources.forEach((s, i) => out.push(`  ${i + 1}. ${s.title} - ${s.url}`));
      out.push('');
    }
  }
  return out.join('\n');
}

/** Very small Markdown to HTML: enough for headings, lists, code, bold, italic and links. */
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function mdToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let code: string[] | null = null;
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (code) {
        out.push(`<pre>${esc(code.join('\n'))}</pre>`);
        code = null;
      } else {
        closeList();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)/.exec(line);
    const ul = /^\s*[-*]\s+(.*)/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)/.exec(line);
    if (h) {
      closeList();
      out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`);
    } else if (ul || ol) {
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
    } else if (!line.trim()) {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (code) out.push(`<pre>${esc(code.join('\n'))}</pre>`);
  closeList();
  return out.join('\n');
}

export function toHtml(title: string, msgs: ExportMessage[]): string {
  const body = msgs
    .map((m) => {
      const src = m.sources?.length
        ? `<div class="src"><b>Sources</b><ol>${m.sources.map((s) => `<li><a href="${esc(s.url)}">${esc(s.title)}</a></li>`).join('')}</ol></div>`
        : '';
      const att = m.attachments?.length ? `<div class="att">Attached: ${esc(m.attachments.map((a) => a.name).join(', '))}</div>` : '';
      return `<section class="${m.role}"><div class="who">${m.role === 'user' ? 'You' : 'Turzam'}</div>${att}${mdToHtml(m.content)}${src}</section>`;
    })
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
 body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#141826;margin:36px;line-height:1.55;font-size:14px}
 h1{font-size:26px;margin:0 0 4px} .meta{color:#6b7288;font-size:12px;margin-bottom:22px}
 section{margin:0 0 16px;padding:12px 16px;border-radius:12px;page-break-inside:avoid}
 section.user{background:#eef2ff} section.model{background:#f7f8fb;border:1px solid #e3e6ef}
 .who{font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#4a5bd6;margin-bottom:6px}
 .att,.src{font-size:12px;color:#6b7288;margin:4px 0} pre{background:#101424;color:#e8ecff;padding:10px;border-radius:8px;white-space:pre-wrap;font-size:12px}
 code{background:#e9ecf6;padding:1px 4px;border-radius:4px} pre code{background:none} a{color:#2f5bd8} p{margin:6px 0}
 .foot{margin-top:24px;color:#9aa1b8;font-size:11px;text-align:center}
</style></head><body>
<h1>${esc(title)}</h1><div class="meta">Exported from Turzam AI · ${new Date().toLocaleDateString()}</div>
${body}
<div class="foot">Turzam AI · The AI for business &amp; founders</div></body></html>`;
}

/** Builds the file and opens the system share sheet (save to Files, send, print...). */
export async function exportChat(title: string, msgs: ExportMessage[], format: ExportFormat): Promise<void> {
  if (!msgs.length) throw new Error('This chat is empty.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const base = safeName(title);

  if (format === 'pdf') {
    const { uri } = await Print.printToFileAsync({ html: toHtml(title, msgs) });
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Export chat as PDF' });
    return;
  }

  const text = format === 'md' ? toMarkdown(title, msgs) : toText(title, msgs);
  const file = new File(Paths.cache, `${base}.${format}`);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, {
    mimeType: format === 'md' ? 'text/markdown' : 'text/plain',
    UTI: format === 'md' ? 'net.daringfireball.markdown' : 'public.plain-text',
    dialogTitle: format === 'md' ? 'Export chat as Markdown' : 'Export chat as text',
  });
}
