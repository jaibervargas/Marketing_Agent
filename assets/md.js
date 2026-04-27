export function mdToHtml(md) {
  const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blocks = [];
  md = md.replace(/```([a-z]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push(`<pre><code>${escape(code)}</code></pre>`);
    return ` ${blocks.length - 1} `;
  });
  let html = escape(md)
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^&gt; (.*$)/gm, '<blockquote>$1</blockquote>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  const lines = html.split('\n');
  const out = [];
  let inUl = false, inOl = false, para = [];
  const flushPara = () => {
    if (para.length) { out.push('<p>' + para.join(' ') + '</p>'); para = []; }
  };
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push('<li>' + line.replace(/^\s*[-*]\s+/, '') + '</li>');
    } else if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push('<li>' + line.replace(/^\s*\d+\.\s+/, '') + '</li>');
    } else if (/^<(h[1-3]|hr|blockquote|pre)/.test(line)) {
      flushPara();
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      out.push(line);
    } else if (line.trim() === '') {
      flushPara();
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
    } else {
      para.push(line);
    }
  }
  flushPara();
  if (inUl) out.push('</ul>');
  if (inOl) out.push('</ol>');
  return out.join('\n').replace(/ (\d+) /g, (_, i) => blocks[+i]);
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
