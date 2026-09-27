/**
 * ChatKeep — which chat site this is, where its messages are, and turning a
 * reply's HTML into Markdown. Works on a DOM, so the same code runs in the
 * page and in tests.
 */
(function (root) {
  'use strict';

  const SITES = {
    chatgpt: {
      hosts: ['chatgpt.com', 'chat.openai.com'],
      name: 'ChatGPT',
      // Every turn carries its author: data-message-role on the current page,
      // data-message-author-role on the older one.
      messages(doc) {
        return [...doc.querySelectorAll('[data-message-role], [data-message-author-role]')].map(el => ({
          role: (el.getAttribute('data-message-role') || el.getAttribute('data-message-author-role')) === 'user' ? 'user' : 'assistant',
          el: el.querySelector('[data-assistant-markdown], [data-user-message-bubble], .markdown, .whitespace-pre-wrap') || el,
        })).filter(m => m.el.textContent.trim());
      },
      input: (doc) => doc.querySelector('#prompt-textarea, div[contenteditable="true"].ProseMirror, textarea'),
    },
    claude: {
      hosts: ['claude.ai'],
      name: 'Claude',
      messages(doc) {
        const sel = '[data-testid="user-message"], .font-claude-response, .font-claude-message';
        return [...doc.querySelectorAll(sel)]
          .filter(el => !el.parentElement || !el.parentElement.closest(sel))
          .map(el => ({ role: el.matches('[data-testid="user-message"]') ? 'user' : 'assistant', el }))
          .filter(m => m.el.textContent.trim());
      },
      input: (doc) => doc.querySelector('div[contenteditable="true"].ProseMirror, div[contenteditable="true"], textarea'),
    },
    gemini: {
      hosts: ['gemini.google.com'],
      name: 'Gemini',
      messages(doc) {
        return [...doc.querySelectorAll('user-query, model-response')].map(el => ({
          role: el.tagName.toLowerCase() === 'user-query' ? 'user' : 'assistant',
          el: el.querySelector('.query-text, .markdown, message-content') || el,
        })).filter(m => m.el.textContent.trim());
      },
      input: (doc) => doc.querySelector('rich-textarea .ql-editor, div[contenteditable="true"], textarea'),
    },
  };

  const Keep = {
    SITES,

    siteFor(host) {
      const h = String(host || '').toLowerCase();
      for (const [id, s] of Object.entries(SITES)) if (s.hosts.some(x => h === x || h.endsWith('.' + x))) return id;
      return null;
    },

    // "Cheapest flights to Tokyo - ChatGPT" -> "Cheapest flights to Tokyo".
    // A title that is only the site's own name ("ChatGPT", "ChatGPT: Chat,
    // Work...") falls back to the first thing you asked.
    title(docTitle, siteName, firstAsk) {
      const t = String(docTitle || '').replace(new RegExp('\\s*[-|\u2013\u2014]\\s*' + siteName + '\\s*$', 'i'), '').trim();
      const generic = !t || t.toLowerCase() === siteName.toLowerCase() || t.toLowerCase().startsWith(siteName.toLowerCase() + ':');
      if (!generic) return t;
      const ask = String(firstAsk || '').trim().split('\n')[0].slice(0, 60).trim();
      return ask || siteName + ' conversation';
    },

    fileName(title, now = new Date()) {
      const day = now.toISOString().slice(0, 10);
      const safe = String(title || 'chat').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'chat';
      return safe + ' (' + day + ').md';
    },

    // HTML of one message -> Markdown. Headings, lists (nested), code blocks
    // with their language, inline code, bold/italic, links, quotes, tables,
    // rules. Buttons, icons and "Copy code" chrome are dropped.
    toMarkdown(el) {
      const out = this._block(el).replace(/\n{3,}/g, '\n\n').trim();
      return out;
    },

    _text(node) { return String(node.nodeValue || '').replace(/\s+/g, ' '); },

    _inline(node) {
      if (node.nodeType === 3) return this._text(node);
      if (node.nodeType !== 1) return '';
      const tag = node.tagName.toLowerCase();
      if (['button', 'svg', 'style', 'script', 'img'].includes(tag)) return '';
      const inner = () => [...node.childNodes].map(n => this._inline(n)).join('');
      switch (tag) {
        case 'strong': case 'b': { const t = inner().trim(); return t ? '**' + t + '**' : ''; }
        case 'em': case 'i': { const t = inner().trim(); return t ? '*' + t + '*' : ''; }
        case 'code': return '`' + node.textContent + '`';
        case 'a': { const t = inner().trim(); const href = node.getAttribute('href'); return href && /^https?:/.test(href) ? '[' + (t || href) + '](' + href + ')' : t; }
        case 'br': return '\n';
        default: return inner();
      }
    },

    _list(node, depth) {
      const ordered = node.tagName.toLowerCase() === 'ol';
      let n = Number(node.getAttribute('start')) || 1;
      const lines = [];
      for (const li of node.children) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        const own = [], nested = [];
        for (const c of li.childNodes) {
          if (c.nodeType === 1 && /^(ul|ol)$/i.test(c.tagName)) nested.push(this._list(c, depth + 1));
          else if (c.nodeType === 1 && /^(p|div)$/i.test(c.tagName)) own.push(this._inlineBlock(c));
          else own.push(this._inline(c));
        }
        const marker = ordered ? (n++) + '. ' : '- ';
        lines.push('  '.repeat(depth) + marker + own.join(' ').replace(/\s+/g, ' ').trim());
        for (const x of nested) lines.push(x);
      }
      return lines.join('\n');
    },

    _inlineBlock(node) { return [...node.childNodes].map(n => this._inline(n)).join('').trim(); },

    _code(pre) {
      const code = pre.querySelector('code') || pre;
      const lang = ((code.className || '').match(/language-([\w+#-]+)/) || [])[1] || pre.getAttribute('data-language') || '';
      return '```' + lang + '\n' + code.textContent.replace(/\n+$/, '') + '\n```';
    },

    _table(t) {
      const rows = [...t.querySelectorAll('tr')].map(tr => [...tr.children].map(c => this._inlineBlock(c).replace(/\|/g, '\\|')));
      if (!rows.length) return '';
      const width = Math.max(...rows.map(r => r.length));
      const line = (r) => '| ' + Array.from({ length: width }, (_, i) => r[i] || '').join(' | ') + ' |';
      return [line(rows[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...rows.slice(1).map(line)].join('\n');
    },

    _block(node) {
      const parts = [];
      for (const c of node.childNodes) {
        if (c.nodeType === 3) { const t = this._text(c).trim(); if (t) parts.push(t); continue; }
        if (c.nodeType !== 1) continue;
        const tag = c.tagName.toLowerCase();
        if (['button', 'svg', 'style', 'script'].includes(tag)) continue;
        if (/^h[1-6]$/.test(tag)) parts.push('#'.repeat(+tag[1]) + ' ' + this._inlineBlock(c));
        else if (tag === 'p') parts.push(this._inlineBlock(c));
        else if (tag === 'pre') parts.push(this._code(c));
        else if (tag === 'ul' || tag === 'ol') parts.push(this._list(c, 0));
        else if (tag === 'blockquote') parts.push(this._block(c).split('\n').map(l => '> ' + l).join('\n'));
        else if (tag === 'table') parts.push(this._table(c));
        else if (tag === 'hr') parts.push('---');
        else if (c.querySelector && c.querySelector('p, pre, ul, ol, h1, h2, h3, h4, table, blockquote')) parts.push(this._block(c));
        else { const t = this._inlineBlock(c); if (t) parts.push(t); }
      }
      return parts.filter(Boolean).join('\n\n');
    },

    // The whole conversation as one Markdown document.
    conversation(siteId, doc, now = new Date()) {
      const site = SITES[siteId];
      const msgs = site.messages(doc);
      const first = msgs.find(m => m.role === 'user');
      const title = this.title(doc.title, site.name, first && (first.el.innerText || first.el.textContent));
      const head = '# ' + title + '\n\n*' + site.name + ' \u00b7 exported ' + now.toISOString().slice(0, 16).replace('T', ' ') + ' \u00b7 ' + (doc.location ? doc.location.href : '') + '*';
      const body = msgs.map(m => '## ' + (m.role === 'user' ? 'You' : site.name) + '\n\n' + (m.role === 'user' ? m.el.innerText || m.el.textContent : this.toMarkdown(m.el)).trim());
      return { title, count: msgs.length, markdown: [head, ...body].join('\n\n') + '\n' };
    },
  };

  root.ChatKeep = Keep;
  if (typeof module !== 'undefined' && module.exports) module.exports = Keep;
})(typeof window !== 'undefined' ? window : globalThis);
