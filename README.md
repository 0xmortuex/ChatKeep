# ChatKeep

Keep what you get out of ChatGPT, Claude and Gemini.

- **Export as Markdown.** The open conversation, with headings, lists, tables, links and code blocks (with their language) intact. Copy it, or download a `.md` file named after the chat.
- **One prompt library for all three.** Save what you typed as a prompt, then insert it on any of the three sites from **Prompts**. Stored in the browser only (`chrome.storage.local`), never sent anywhere.

The toolbar sits top right in its own shadow root, so the sites' styles cannot break it. ChatKeep reads nothing but the page you are on and makes no network requests.

Checked on the current ChatGPT page (2026-09). Claude and Gemini change their markup often; if an export comes out empty there, open an issue.

## Install

**In Vex:** Settings › Extensions › *Extensions worth installing* › ChatKeep › **Install**.

**In Chrome or Brave:** download `ChatKeep-<version>.zip` from [Releases](https://github.com/0xmortuex/ChatKeep/releases/latest), unzip, `chrome://extensions` › Developer mode › **Load unpacked**.

## Development

Plain Manifest V3, no build step. Tests: `pnpm install && pnpm test` (uses jsdom).

MIT — by **0xmortuex**
