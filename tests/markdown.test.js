// Run: pnpm install && pnpm test   (needs jsdom)
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const K = require('../chatkeep-logic.js');

const dom = (html) => new JSDOM('<!doctype html><body>' + html + '</body>').window.document.body.firstElementChild;

test('a reply becomes Markdown', () => {
  const el = dom(`<div class="markdown">
    <h2>Setting it up</h2>
    <p>Use <strong>pnpm</strong> and <em>TypeScript</em>, see <a href="https://pnpm.io">the docs</a>. Run <code>pnpm i</code>.</p>
    <ol><li>Install</li><li>Configure<ul><li>tsconfig</li><li>eslint</li></ul></li></ol>
    <pre><div>bash<button>Copy code</button></div><code class="language-bash">pnpm add -D typescript
</code></pre>
    <blockquote><p>Keep it simple.</p></blockquote>
    <table><tr><th>Tool</th><th>Why</th></tr><tr><td>pnpm</td><td>fast | small</td></tr></table>
    <hr>
  </div>`);
  assert.equal(K.toMarkdown(el), [
    '## Setting it up',
    'Use **pnpm** and *TypeScript*, see [the docs](https://pnpm.io). Run `pnpm i`.',
    '1. Install\n2. Configure\n  - tsconfig\n  - eslint',
    '```bash\npnpm add -D typescript\n```',
    '> Keep it simple.',
    '| Tool | Why |\n| --- | --- |\n| pnpm | fast \\| small |',
    '---',
  ].join('\n\n'));
});

test('site, title and file name', () => {
  assert.equal(K.siteFor('chatgpt.com'), 'chatgpt');
  assert.equal(K.siteFor('claude.ai'), 'claude');
  assert.equal(K.siteFor('gemini.google.com'), 'gemini');
  assert.equal(K.siteFor('example.com'), null);
  assert.equal(K.title('Cheapest flights to Tokyo - ChatGPT', 'ChatGPT'), 'Cheapest flights to Tokyo');
  assert.equal(K.title('ChatGPT', 'ChatGPT'), 'ChatGPT conversation');
  assert.equal(K.fileName('What: is <this>?', new Date('2026-09-27T12:00:00Z')), 'What is this (2026-09-27).md');
});

test('ChatGPT turns are found in order, with their author', () => {
  const doc = new JSDOM(`<!doctype html><title>Plan - ChatGPT</title><body>
    <div data-message-author-role="user"><div class="whitespace-pre-wrap">Plan my day</div></div>
    <div data-message-author-role="assistant"><div class="markdown"><p>Here is a plan.</p></div></div>
  </body>`, { url: 'https://chatgpt.com/c/1' }).window.document;
  const conv = K.conversation('chatgpt', doc, new Date('2026-09-27T12:00:00Z'));
  assert.equal(conv.count, 2);
  assert.equal(conv.title, 'Plan');
  assert.match(conv.markdown, /## You\n\nPlan my day\n\n## ChatGPT\n\nHere is a plan\./);
});

test('the current ChatGPT page: roles on list items, reply in stream blocks', () => {
  const doc = new JSDOM(`<!doctype html><title>ChatGPT: Chat, Work, Create &amp; Code with AI</title><body>
    <ol data-conversation-transcript>
      <li data-message-role="user"><div data-user-message-bubble>Say hi in Python</div><button data-user-message-copy>Copy</button></li>
      <li data-message-role="assistant"><div data-assistant-markdown>
        <div data-assistant-stream-block><h2>Demo</h2></div>
        <pre data-assistant-stream-block><code class="language-python">print("hi")</code></pre>
      </div><div data-message-actions><button>Copy</button></div></li>
    </ol>
  </body>`, { url: 'https://chatgpt.com/c/2' }).window.document;
  const conv = K.conversation('chatgpt', doc, new Date('2026-09-27T12:00:00Z'));
  assert.equal(conv.count, 2);
  assert.equal(conv.title, 'Say hi in Python');
  assert.match(conv.markdown, /## You\n\nSay hi in Python\n\n## ChatGPT\n\n## Demo\n\n```python\nprint\("hi"\)\n```/);
});
