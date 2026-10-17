// A small Markdown renderer for the packages' READMEs: headings, paragraphs, lists (nested by indent), fenced code,
// tables, block quotes, inline code, bold, italic and links. Enough for these READMEs, with no dependency.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function inline (text, link = (u) => u) {
  const code = []
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${code.push(c) - 1}\u0000`)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${link(u.replace(/&amp;/g, '&'))}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${code[i]}</code>`)
}

export function markdown (src, { link, shift = 0 } = {}) {
  const lines = src.replace(/\r/g, '').split('\n'), out = []
  let i = 0
  const para = []
  const flush = () => { if (para.length) out.push(`<p>${inline(para.join(' '), link)}</p>`); para.length = 0 }
  while (i < lines.length) {
    const l = lines[i]
    if (/^```/.test(l)) {
      flush(); const lang = l.slice(3).trim(), body = []
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) body.push(lines[i])
      out.push(`<pre${lang ? ` data-lang="${lang}"` : ''}><code>${esc(body.join('\n'))}</code></pre>`); i++; continue
    }
    const h = l.match(/^(#{1,6})\s+(.*)/)
    if (h) { flush(); const n = Math.min(h[1].length + shift, 6); out.push(`<h${n}>${inline(h[2], link)}</h${n}>`); i++; continue }
    if (/^\|/.test(l)) {
      flush(); const rows = []
      for (; i < lines.length && /^\|/.test(lines[i]); i++) rows.push(lines[i].replace(/^\||\|\s*$/g, '').split(/(?<!\\)\|/).map((c) => c.trim()))
      const body = rows.filter((r) => !r.every((c) => /^:?-+:?$/.test(c)))
      out.push(`<div class="table"><table><thead><tr>${body[0].map((c) => `<th>${inline(c, link)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c, link)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }
    if (/^>\s?/.test(l)) {
      flush(); const q = []
      for (; i < lines.length && /^>\s?/.test(lines[i]); i++) q.push(lines[i].replace(/^>\s?/, ''))
      out.push(`<blockquote>${markdown(q.join('\n'), { link })}</blockquote>`); continue
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      flush(); const block = []
      for (; i < lines.length && (/^\s*([-*]|\d+\.)\s+/.test(lines[i]) || (/^\s+\S/.test(lines[i]) && block.length)); i++) block.push(lines[i])
      out.push(list(block, link)); continue
    }
    if (!l.trim()) { flush(); i++; continue }
    para.push(l.trim()); i++
  }
  flush()
  return out.join('\n')
}

// A list block: items at the smallest indent; deeper lines belong to the item above (continuations or a nested list)
function list (block, link) {
  const indent = (s) => s.match(/^\s*/)[0].length, base = Math.min(...block.filter((s) => /^\s*([-*]|\d+\.)\s/.test(s)).map(indent))
  const ordered = /^\s*\d+\./.test(block[0]), items = []
  for (const l of block) {
    if (indent(l) === base && /^\s*([-*]|\d+\.)\s/.test(l)) items.push([l.replace(/^\s*([-*]|\d+\.)\s+/, '')])
    else items.at(-1).push(l)
  }
  const tag = ordered ? 'ol' : 'ul'
  return `<${tag}>${items.map(([first, ...rest]) => {
    const nested = rest.findIndex((s) => /^\s*([-*]|\d+\.)\s/.test(s))
    const text = [first, ...(nested < 0 ? rest : rest.slice(0, nested))].map((s) => s.trim()).join(' ')
    return `<li>${inline(text, link)}${nested < 0 ? '' : list(rest.slice(nested), link)}</li>`
  }).join('')}</${tag}>`
}
