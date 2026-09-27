/**
 * ChatKeep — a small toolbar on ChatGPT, Claude and Gemini:
 *   Export  the open conversation as Markdown (copy, or download a .md);
 *   Prompts your saved prompts, shared by all three: insert one, save what
 *           you have typed, remove one.
 * It lives in a closed shadow root, so the sites' styles cannot reach it.
 */
(function () {
  'use strict';
  const K = window.ChatKeep;
  const siteId = K.siteFor(location.hostname);
  if (!siteId || window.__chatKeep) return;
  window.__chatKeep = true;
  const site = K.SITES[siteId];

  const host = document.createElement('div');
  host.setAttribute('data-chatkeep', '');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    :host { all: initial; }
    .bar { position: fixed; z-index: 2147483000; top: 64px; right: 16px; display: flex; gap: 6px; font: 13px/1.4 system-ui, "Segoe UI", sans-serif; }
    button { font: inherit; cursor: pointer; border-radius: 999px; border: 1px solid rgba(128,128,128,.35); background: rgba(250,250,250,.92); color: #222; padding: 5px 12px; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
    button:hover { border-color: #7c3aed; }
    @media (prefers-color-scheme: dark) { button { background: rgba(38,38,42,.95); color: #eee; } .menu { background: #26262a; color: #eee; } .menu li:hover { background: #3a3a40; } }
    .menu { position: absolute; top: 36px; right: 0; min-width: 260px; max-width: 360px; max-height: 60vh; overflow: auto; background: #fff; color: #222; border: 1px solid rgba(128,128,128,.35); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.2); padding: 6px; }
    .menu[hidden] { display: none; }
    .menu ul { list-style: none; margin: 0; padding: 0; }
    .menu li { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 7px; cursor: pointer; }
    .menu li:hover { background: #f1eefc; }
    .menu li .t { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .menu li .x { border: 0; box-shadow: none; background: transparent; padding: 0 4px; opacity: .55; }
    .menu li .x:hover { opacity: 1; }
    .menu .sep { height: 1px; background: rgba(128,128,128,.25); margin: 4px 6px; padding: 0; cursor: default; }
    .menu .muted { color: #888; cursor: default; }
    .toast { position: fixed; z-index: 2147483000; top: 104px; right: 16px; background: #222; color: #fff; padding: 6px 12px; border-radius: 8px; font: 12.5px system-ui, sans-serif; }
  </style>
  <div class="bar">
    <div style="position:relative"><button id="exp" aria-haspopup="menu">Export</button><div class="menu" id="expMenu" hidden role="menu"><ul>
      <li id="copy" role="menuitem"><span class="t">Copy as Markdown</span></li>
      <li id="dl" role="menuitem"><span class="t">Download .md file</span></li>
    </ul></div></div>
    <div style="position:relative"><button id="pr" aria-haspopup="menu">Prompts</button><div class="menu" id="prMenu" hidden role="menu"><ul id="prList"></ul></div></div>
  </div>`;
  document.documentElement.appendChild(host);
  const $ = (id) => root.getElementById(id);

  let toastTimer = null;
  function toast(text) {
    let t = root.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; root.appendChild(t); }
    t.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2200);
  }
  function closeMenus() { $('expMenu').hidden = true; $('prMenu').hidden = true; }
  document.addEventListener('mousedown', (e) => { if (!e.composedPath().includes(host)) closeMenus(); }, true);

  // ---- export ----------------------------------------------------------------
  function exportNow() {
    const conv = K.conversation(siteId, document);
    if (!conv.count) { toast('No messages on this page yet'); return null; }
    return conv;
  }
  $('exp').addEventListener('click', () => { const m = $('expMenu'); const open = m.hidden; closeMenus(); m.hidden = !open; });
  $('copy').addEventListener('click', async () => {
    closeMenus();
    const conv = exportNow(); if (!conv) return;
    try { await navigator.clipboard.writeText(conv.markdown); toast('Copied ' + conv.count + ' messages as Markdown'); }
    catch { toast('Could not copy'); }
  });
  $('dl').addEventListener('click', () => {
    closeMenus();
    const conv = exportNow(); if (!conv) return;
    const url = URL.createObjectURL(new Blob([conv.markdown], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url; a.download = K.fileName(conv.title);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Saved ' + a.download);
  });

  // ---- prompts ---------------------------------------------------------------
  const KEY = 'chatkeep_prompts';
  const getPrompts = () => new Promise(r => chrome.storage.local.get(KEY, x => r(x[KEY] || [])));
  const setPrompts = (list) => new Promise(r => chrome.storage.local.set({ [KEY]: list }, r));

  function typedText() {
    const box = site.input(document);
    if (!box) return '';
    return (box.value != null ? box.value : box.innerText || '').trim();
  }
  function insert(text) {
    const box = site.input(document);
    if (!box) { toast('Could not find the message box'); return; }
    box.focus();
    if (box.value != null && box.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(box, (box.value ? box.value + '\n' : '') + text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const sel = window.getSelection();
      sel.selectAllChildren(box); sel.collapseToEnd();
      document.execCommand('insertText', false, text);
    }
  }

  async function paintPrompts() {
    const list = await getPrompts();
    const ul = $('prList');
    ul.textContent = '';
    const add = (label, onClick, cls) => {
      const li = document.createElement('li');
      if (cls) li.className = cls;
      const t = document.createElement('span'); t.className = 't'; t.textContent = label;
      li.appendChild(t);
      if (onClick) li.addEventListener('click', onClick);
      ul.appendChild(li);
      return li;
    };
    if (!list.length) add('No saved prompts yet', null, 'muted');
    list.forEach((p, i) => {
      const li = add(p.title, () => { closeMenus(); insert(p.text); });
      li.title = p.text.slice(0, 400);
      const x = document.createElement('button'); x.className = 'x'; x.textContent = '×'; x.title = 'Remove';
      x.addEventListener('click', async (e) => { e.stopPropagation(); const l = await getPrompts(); l.splice(i, 1); await setPrompts(l); paintPrompts(); });
      li.appendChild(x);
    });
    const sep = document.createElement('li'); sep.className = 'sep'; ul.appendChild(sep);
    add('Save what I typed as a prompt', async () => {
      const text = typedText();
      if (!text) { toast('Type the prompt in the message box first'); return; }
      const l = await getPrompts();
      l.unshift({ title: text.split('\n')[0].slice(0, 60), text, at: Date.now() });
      await setPrompts(l.slice(0, 100));
      toast('Saved. It is in Prompts on ChatGPT, Claude and Gemini');
      paintPrompts();
    });
  }
  $('pr').addEventListener('click', async () => { const m = $('prMenu'); const open = m.hidden; closeMenus(); if (open) { await paintPrompts(); m.hidden = false; } });
})();
