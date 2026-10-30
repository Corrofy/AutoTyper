/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import JSZip from 'jszip';
import { Snippet, AutoTyperSettings, GeneratedExtensionFile, TargetBrowser } from '../types/extension.ts';
import { ICON_PNG_BASE64, ICON_SIZES } from '../data/iconAssets.ts';

export function generateExtensionFiles(
  snippets: Snippet[],
  settings: AutoTyperSettings,
  targetBrowser: TargetBrowser = 'chrome'
): GeneratedExtensionFile[] {
  const isFirefox = targetBrowser === 'firefox';
  const iconMap = Object.fromEntries(
    ICON_SIZES.map((size) => [String(size), `icons/icon${size}.png`])
  );

  // 1. Manifest
  const manifest = isFirefox
    ? {
        manifest_version: 3,
        name: 'AutoTyper Pro - Auto Type Paste & Snippets',
        version: '1.2.1',
        description: 'Auto-types pasted text and selected snippets into any field with realistic keystrokes, anti-paste bypass, and custom keyboard shortcuts.',
        browser_specific_settings: {
          gecko: {
            id: 'autotyper-pro@example.com',
            strict_min_version: '109.0',
          },
        },
        permissions: ['storage', 'activeTab', 'scripting', 'contextMenus', 'clipboardRead'],
        icons: iconMap,
        action: {
          default_popup: 'popup.html',
          default_icon: iconMap,
        },
        background: {
          scripts: ['background.js'],
        },
        content_scripts: [
          {
            matches: ['<all_urls>'],
            js: ['content.js'],
            css: ['content.css'],
            run_at: 'document_idle',
            all_frames: true,
            match_about_blank: true,
          },
        ],
        options_ui: {
          page: 'options.html',
          open_in_tab: true,
        },
      }
    : {
        manifest_version: 3,
        name: 'AutoTyper Pro - Auto Type Paste & Snippets',
        version: '1.2.1',
        description: 'Auto-types pasted text and selected snippets into any field with realistic keystrokes, anti-paste bypass, and custom keyboard shortcuts.',
        permissions: ['storage', 'activeTab', 'scripting', 'contextMenus', 'clipboardRead', 'offscreen'],
        icons: iconMap,
        action: {
          default_popup: 'popup.html',
          default_icon: iconMap,
        },
        background: {
          service_worker: 'background.js',
        },
        content_scripts: [
          {
            matches: ['<all_urls>'],
            js: ['content.js'],
            css: ['content.css'],
            run_at: 'document_idle',
            all_frames: true,
            match_about_blank: true,
          },
        ],
        options_ui: {
          page: 'options.html',
          open_in_tab: true,
        },
      };

  // 2. background.js
  const backgroundJs = `/**
 * AutoTyper Pro - Background Service Worker / Background Page
 * Compatible with Chrome, Firefox, Edge, Brave & Opera
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const INITIAL_SETTINGS = ${JSON.stringify(settings, null, 2)};
const INITIAL_SNIPPETS = ${JSON.stringify(snippets, null, 2)};

// ---------------------------------------------------------------------------
// Clipboard reading
// Chromium service workers have no DOM, so clipboard reads are delegated to a
// short-lived offscreen document. Firefox uses its background page directly.
// ---------------------------------------------------------------------------
async function readClipboardText() {
  // 1. Direct read works in Firefox background pages and some Chromium builds.
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
    try {
      const text = await navigator.clipboard.readText();
      if (text) return text;
    } catch (err) {
      // Fall through to the offscreen document.
    }
  }

  // 2. Chromium offscreen document.
  if (browserAPI.offscreen && browserAPI.offscreen.createDocument) {
    try {
      let hasDocument = false;
      if (browserAPI.runtime.getContexts) {
        const contexts = await browserAPI.runtime.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT']
        });
        hasDocument = !!(contexts && contexts.length);
      }
      if (!hasDocument) {
        await browserAPI.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['CLIPBOARD'],
          justification: 'Read clipboard text so AutoTyper can retype it as keystrokes'
        });
      }
      const response = await browserAPI.runtime.sendMessage({ action: 'OFFSCREEN_READ_CLIPBOARD' });
      if (response && response.text) return response.text;
    } catch (err) {
      console.warn('[AutoTyper Pro] Offscreen clipboard read failed:', err);
    }
  }

  return '';
}

// ---------------------------------------------------------------------------
// Context menus (rebuilt on install and whenever snippets change)
// ---------------------------------------------------------------------------
async function registerContextMenus() {
  try {
    await browserAPI.contextMenus.removeAll();
  } catch (err) {
    // removeAll may reject when no menus exist yet; ignore.
  }

  try {
    const data = await browserAPI.storage.local.get(['snippets']);
    const list = data.snippets || INITIAL_SNIPPETS;

    browserAPI.contextMenus.create({
      id: 'autotyper_root',
      title: 'AutoTyper Pro',
      contexts: ['editable', 'selection']
    });
    browserAPI.contextMenus.create({
      id: 'autotyper_clipboard',
      parentId: 'autotyper_root',
      title: 'Auto-Type Clipboard Text',
      contexts: ['editable']
    });
    browserAPI.contextMenus.create({
      id: 'autotyper_picker',
      parentId: 'autotyper_root',
      title: 'Quick Snippet Command Palette...',
      contexts: ['editable']
    });
    browserAPI.contextMenus.create({
      id: 'autotyper_snippets_menu',
      parentId: 'autotyper_root',
      title: 'Top Snippets',
      contexts: ['editable']
    });

    list.slice(0, 6).forEach((snippet, index) => {
      browserAPI.contextMenus.create({
        id: 'snip_' + snippet.id,
        parentId: 'autotyper_snippets_menu',
        title: (index + 1) + '. ' + snippet.title + (snippet.keyboardShortcut ? ' (' + snippet.keyboardShortcut + ')' : ''),
        contexts: ['editable']
      });
    });
  } catch (err) {
    console.warn('[AutoTyper Pro] Context menu registration failed:', err);
  }
}

browserAPI.runtime.onInstalled.addListener(async () => {
  const data = await browserAPI.storage.local.get(['settings', 'snippets']);
  if (!data.settings) {
    await browserAPI.storage.local.set({ settings: INITIAL_SETTINGS });
  }
  if (!data.snippets) {
    await browserAPI.storage.local.set({ snippets: INITIAL_SNIPPETS });
  }
  await registerContextMenus();
});

if (browserAPI.storage && browserAPI.storage.onChanged) {
  browserAPI.storage.onChanged.addListener((changes) => {
    if (changes.snippets) registerContextMenus();
  });
}

// ---------------------------------------------------------------------------
// Message dispatch with dynamic injection fallback
// ---------------------------------------------------------------------------
async function safeSendMessage(tabId, message) {
  try {
    await browserAPI.tabs.sendMessage(tabId, message);
  } catch (err) {
    try {
      if (browserAPI.scripting && browserAPI.scripting.executeScript) {
        await browserAPI.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
        await browserAPI.scripting.insertCSS({ target: { tabId, allFrames: true }, files: ['content.css'] });
      } else if (browserAPI.tabs.executeScript) {
        await browserAPI.tabs.executeScript(tabId, { file: 'content.js', allFrames: true });
        await browserAPI.tabs.insertCSS(tabId, { file: 'content.css', allFrames: true });
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
      await browserAPI.tabs.sendMessage(tabId, message);
    } catch (e) {
      console.warn('[AutoTyper Pro] Tab connection failed:', e);
    }
  }
}

// Context menu clicks
browserAPI.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === 'autotyper_clipboard') {
    const text = await readClipboardText();
    if (text) {
      safeSendMessage(tab.id, { action: 'AUTO_TYPE_TEXT', text, title: 'Clipboard Text' });
    }
  } else if (info.menuItemId === 'autotyper_picker') {
    safeSendMessage(tab.id, { action: 'OPEN_SNIPPET_PICKER' });
  } else if (String(info.menuItemId).startsWith('snip_')) {
    const snipId = String(info.menuItemId).replace('snip_', '');
    const data = await browserAPI.storage.local.get(['snippets']);
    const list = data.snippets || INITIAL_SNIPPETS;
    const found = list.find((s) => s.id === snipId);
    if (found) {
      safeSendMessage(tab.id, {
        action: 'AUTO_TYPE_TEXT',
        text: found.content,
        title: found.title
      });
    }
  }
});

// Messages from content scripts and popup/options pages
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'OPEN_OPTIONS_PAGE') {
    if (browserAPI.runtime.openOptionsPage) {
      browserAPI.runtime.openOptionsPage();
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.action === 'READ_CLIPBOARD') {
    readClipboardText()
      .then((text) => sendResponse({ text }))
      .catch(() => sendResponse({ text: '' }));
    return true;
  }

  return false;
});
`;

  // 3. offscreen.html / offscreen.js (Chromium clipboard bridge)
  const offscreenHtml = isFirefox
    ? ''
    : `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AutoTyper Pro Clipboard Bridge</title>
</head>
<body>
  <script src="offscreen.js"></script>
</body>
</html>
`;

  const offscreenJs = isFirefox
    ? ''
    : `/**
 * AutoTyper Pro - Offscreen clipboard bridge (Chromium only)
 * The MV3 service worker has no DOM, so clipboard reads happen here.
 */
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'OFFSCREEN_READ_CLIPBOARD') return false;

  navigator.clipboard
    .readText()
    .then((text) => sendResponse({ text }))
    .catch((err) => {
      console.warn('[AutoTyper Pro] Offscreen clipboard read failed:', err);
      sendResponse({ text: '' });
    });

  return true;
});
`;


  // 3. content.js
  const contentJs = `/**
 * AutoTyper Pro - In-Page Content Script
 * Executes keystroke emulation, paste interception, custom shortcuts, and command palette
 */

(() => {
  // The background script may re-inject this file when a tab was loaded before
  // the extension. Never register listeners twice.
  if (window.__autotyperProInjected) return;
  window.__autotyperProInjected = true;

  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  let currentSettings = ${JSON.stringify(settings)};
  let currentSnippets = ${JSON.stringify(snippets)};
  let activeTyperSession = null;
  let hudElement = null;
  let paletteElement = null;
  let paletteReturnTarget = null;
  let paletteSelectedIndex = 0;
  let paletteResults = [];
  let audioContext = null;

  // Sync settings and snippets from extension storage
  const loadData = async () => {
    try {
      const data = await browserAPI.storage.local.get(['settings', 'snippets']);
      if (data.settings) currentSettings = data.settings;
      if (data.snippets) currentSnippets = data.snippets;
    } catch (e) {
      // Use defaults
    }
  };
  loadData();

  if (browserAPI.storage && browserAPI.storage.onChanged) {
    browserAPI.storage.onChanged.addListener((changes) => {
      if (changes.settings) currentSettings = changes.settings.newValue;
      if (changes.snippets) currentSnippets = changes.snippets.newValue;
    });
  }

  // Find currently active editable element (including inside shadow roots and Monaco/CodeMirror editors)
  function getActiveEditable() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.getAttribute('contenteditable') === 'true')) {
      return el;
    }
    // Check if Monaco Editor (OneCompiler, etc.) or CodeMirror is present and focus its textarea
    const monacoInput = document.querySelector('.monaco-editor textarea.inputarea');
    if (monacoInput) {
      monacoInput.focus();
      return monacoInput;
    }
    const codeMirrorInput = document.querySelector('.CodeMirror textarea, .cm-content');
    if (codeMirrorInput) {
      codeMirrorInput.focus();
      return codeMirrorInput;
    }
    return null;
  }

  // Focus the target and make sure contenteditable fields have a caret.
  function focusEditable(el) {
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      try { el.focus(); } catch (e2) {}
    }

    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !el.contains(sel.anchorNode)) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  }

  // Caret-aware insertion used when execCommand is unavailable.
  function insertTextAtCaret(target, text) {
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      target.value = target.value.slice(0, start) + text + target.value.slice(end);
      target.selectionStart = target.selectionEnd = start + text.length;
      target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      return;
    }

    if (target.isContentEditable) {
      focusEditable(target);
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = text === '\\n'
          ? document.createElement('br')
          : document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.setEndAfter(node);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        target.innerText += text;
      }
      target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
  }

  // Caret-aware backspace used when execCommand('delete') is unavailable.
  function deleteCharBeforeCaret(target) {
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      const start = target.selectionStart ?? target.value.length;
      if (start > 0) {
        target.value = target.value.slice(0, start - 1) + target.value.slice(start);
        target.selectionStart = target.selectionEnd = start - 1;
        target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
      return;
    }

    if (target.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      if (!range.collapsed) {
        range.deleteContents();
      } else {
        const node = range.startContainer;
        const offset = range.startOffset;
        if (node.nodeType === Node.TEXT_NODE && offset > 0) {
          node.deleteData(offset - 1, 1);
        } else if (node.childNodes && offset > 0 && node.childNodes[offset - 1]) {
          node.removeChild(node.childNodes[offset - 1]);
        } else if (node.previousSibling) {
          node.parentNode.removeChild(node.previousSibling);
        }
      }

      const caret = document.createRange();
      caret.selectNodeContents(target);
      caret.collapse(false);
      sel.removeAllRanges();
      sel.addRange(caret);
      target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
  }

  // Interpolate dynamic template tags (kept in sync with the web engine).
  function interpolateTags(text) {
    const now = new Date();
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    return text
      .replace(/\\{\\{date\\}\\}/gi, now.toLocaleDateString())
      .replace(/\\{\\{time\\}\\}/gi, now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      .replace(/\\{\\{weekday\\}\\}/gi, weekdays[now.getDay()])
      .replace(/\\{\\{month\\}\\}/gi, months[now.getMonth()])
      .replace(/\\{\\{year\\}\\}/gi, now.getFullYear().toString())
      .replace(/\\{\\{timestamp\\}\\}/gi, now.toISOString())
      .replace(/\\{\\{name\\}\\}/gi, 'Jordan Taylor')
      .replace(/\\{\\{email\\}\\}/gi, 'jordan.taylor@example.com')
      .replace(/\\{\\{ticket_id\\}\\}/gi, Math.floor(100000 + Math.random() * 900000).toString());
  }

  // Per-character delay honoring speedMode/baseDelayMs, jitter and punctuation.
  function calculateCharacterDelay(char) {
    let delay;

    if (currentSettings.speedMode === 'steady' || currentSettings.speedMode === 'custom') {
      delay = Math.max(5, currentSettings.baseDelayMs || 45);
    } else if (currentSettings.speedMode === 'turbo') {
      delay = 12;
    } else {
      delay = 60000 / (Math.max(10, currentSettings.targetWpm || 75) * 5);
    }

    if (currentSettings.jitterPercent > 0 && currentSettings.speedMode !== 'turbo') {
      const factor = (currentSettings.jitterPercent / 100) * 0.7;
      delay = Math.max(5, delay * (1 + (Math.random() * 2 - 1) * factor));
    }

    if (['.', '!', '?', ';', '\\n'].includes(char)) {
      delay += (currentSettings.punctuationPauseMs ?? 120);
    } else if (char === ' ') {
      delay += delay * 0.3;
    }

    return Math.round(delay);
  }

  function notifyUser(message) {
    try {
      const notice = document.createElement('div');
      notice.textContent = message;
      notice.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#7f1d1d;color:#ffffff;padding:10px 16px;border-radius:8px;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 10px 25px rgba(0,0,0,.4);max-width:420px;text-align:center;';
      document.body.appendChild(notice);
      setTimeout(() => notice.remove(), 3200);
    } catch (e) {
      console.warn('[AutoTyper Pro]', message);
    }
  }

  function playKeySound(isSpace, isEnter) {
    const sound = currentSettings.soundFeedback;
    if (!sound || sound === 'silent') return;

    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') audioContext.resume();

      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const baseFrequency = sound === 'cherry-blue' ? 900 : sound === 'cherry-brown' ? 520 : 720;

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(baseFrequency + (Math.random() * 80 - 40), now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(
        Math.min(0.18, Math.max(0, currentSettings.soundVolume ?? 0.3) * 0.25),
        now + 0.002
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (isEnter ? 0.08 : isSpace ? 0.05 : 0.03));

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.09);
    } catch (e) {
      // Audio feedback is best-effort only.
    }
  }

  // Read the clipboard with progressively weaker fallbacks.
  async function requestClipboardText() {
    try {
      const response = await browserAPI.runtime.sendMessage({ action: 'READ_CLIPBOARD' });
      if (response && response.text) return response.text;
    } catch (e) {
      // Background may be unavailable on restricted pages.
    }

    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) return text;
      }
    } catch (e) {
      // Permission denied or insecure context.
    }

    // Legacy fallback for browsers that still allow paste into a content script.
    try {
      const textarea = document.createElement('textarea');
      textarea.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
      document.body.appendChild(textarea);
      textarea.focus();
      const ok = document.execCommand('paste');
      const text = textarea.value;
      textarea.remove();
      if (ok && text) return text;
    } catch (e) {
      // No clipboard access.
    }

    return '';
  }

  // Robust DOM keycode and code mapping for web editors (Monaco, CodeMirror, etc.)
  // Strictly isolates keyCodes (e.g. 'P' is 80, NOT 112 F1; '.' is 190, NOT 46 Delete; '!' is 49, NOT 33 PageUp)
  function getKeystrokeSpec(char) {
    if (char === '\\n') return { key: 'Enter', code: 'Enter', keyCode: 13, shiftKey: false, charCode: 13 };
    if (char === ' ') return { key: ' ', code: 'Space', keyCode: 32, shiftKey: false, charCode: 32 };
    if (char === '\\t') return { key: 'Tab', code: 'Tab', keyCode: 9, shiftKey: false, charCode: 9 };

    if (/^[a-zA-Z]$/.test(char)) {
      return {
        key: char,
        code: 'Key' + char.toUpperCase(),
        keyCode: char.toUpperCase().charCodeAt(0),
        shiftKey: char === char.toUpperCase(),
        charCode: char.charCodeAt(0)
      };
    }

    if (/^[0-9]$/.test(char)) {
      return {
        key: char,
        code: 'Digit' + char,
        keyCode: char.charCodeAt(0),
        shiftKey: false,
        charCode: char.charCodeAt(0)
      };
    }

    const symbolMap = {
      '!': { keyCode: 49, code: 'Digit1', shiftKey: true },
      '@': { keyCode: 50, code: 'Digit2', shiftKey: true },
      '#': { keyCode: 51, code: 'Digit3', shiftKey: true },
      '$': { keyCode: 52, code: 'Digit4', shiftKey: true },
      '%': { keyCode: 53, code: 'Digit5', shiftKey: true },
      '^': { keyCode: 54, code: 'Digit6', shiftKey: true },
      '&': { keyCode: 55, code: 'Digit7', shiftKey: true },
      '*': { keyCode: 56, code: 'Digit8', shiftKey: true },
      '(': { keyCode: 57, code: 'Digit9', shiftKey: true },
      ')': { keyCode: 48, code: 'Digit0', shiftKey: true },
      '-': { keyCode: 189, code: 'Minus', shiftKey: false },
      '_': { keyCode: 189, code: 'Minus', shiftKey: true },
      '=': { keyCode: 187, code: 'Equal', shiftKey: false },
      '+': { keyCode: 187, code: 'Equal', shiftKey: true },
      '[': { keyCode: 219, code: 'BracketLeft', shiftKey: false },
      '{': { keyCode: 219, code: 'BracketLeft', shiftKey: true },
      ']': { keyCode: 221, code: 'BracketRight', shiftKey: false },
      '}': { keyCode: 221, code: 'BracketRight', shiftKey: true },
      '\\\\': { keyCode: 220, code: 'Backslash', shiftKey: false },
      '|': { keyCode: 220, code: 'Backslash', shiftKey: true },
      ';': { keyCode: 186, code: 'Semicolon', shiftKey: false },
      ':': { keyCode: 186, code: 'Semicolon', shiftKey: true },
      "'": { keyCode: 222, code: 'Quote', shiftKey: false },
      '"': { keyCode: 222, code: 'Quote', shiftKey: true },
      ',': { keyCode: 188, code: 'Comma', shiftKey: false },
      '<': { keyCode: 188, code: 'Comma', shiftKey: true },
      '.': { keyCode: 190, code: 'Period', shiftKey: false },
      '>': { keyCode: 190, code: 'Period', shiftKey: true },
      '/': { keyCode: 191, code: 'Slash', shiftKey: false },
      '?': { keyCode: 191, code: 'Slash', shiftKey: true },
      '\`': { keyCode: 192, code: 'Backquote', shiftKey: false },
      '~': { keyCode: 192, code: 'Backquote', shiftKey: true }
    };

    if (symbolMap[char]) {
      const s = symbolMap[char];
      return { key: char, code: s.code, keyCode: s.keyCode, shiftKey: s.shiftKey, charCode: char.charCodeAt(0) };
    }

    return { key: char, code: '', keyCode: 0, shiftKey: false, charCode: char.charCodeAt(0) };
  }

  // Match KeyboardEvent against stored shortcut string (e.g. "Alt+Shift+V" or "Alt+1")
  function matchesShortcut(e, shortcutString) {
    if (!shortcutString) return false;
    const parts = shortcutString.split('+').map(p => p.trim());
    const hasCtrl = parts.includes('Ctrl');
    const hasAlt = parts.includes('Alt');
    const hasShift = parts.includes('Shift');
    const hasMeta = parts.includes('Meta');
    const mainKey = parts[parts.length - 1];

    if (e.ctrlKey !== hasCtrl) return false;
    if (e.altKey !== hasAlt) return false;
    if (e.shiftKey !== hasShift) return false;
    if (e.metaKey !== hasMeta) return false;

    let eventKey = e.key;
    if (eventKey === ' ') eventKey = 'Space';
    else if (eventKey.length === 1) eventKey = eventKey.toUpperCase();

    return eventKey.toLowerCase() === mainKey.toLowerCase();
  }

  function updateHudSpeed() {
    if (!hudElement) return;
    const speedValEl = hudElement.querySelector('#at-hud-speed-val');
    const turboBtn = hudElement.querySelector('#at-hud-turbo-btn');
    const isTurbo = currentSettings.speedMode === 'turbo';
    if (speedValEl) {
      speedValEl.textContent = isTurbo ? 'TURBO' : (currentSettings.targetWpm || 75) + ' WPM';
    }
    if (turboBtn) {
      if (isTurbo) {
        turboBtn.classList.add('active');
        turboBtn.style.background = 'rgba(245, 158, 11, 0.35)';
      } else {
        turboBtn.classList.remove('active');
        turboBtn.style.background = 'transparent';
      }
    }
  }

  // Floating HUD indicator with live speed controls, pause/play, and mistake triggers
  function showHud(title, totalChars) {
    if (!currentSettings.floatingHudEnabled) return;
    if (!hudElement) {
      hudElement = document.createElement('div');
      hudElement.id = 'autotyper-hud-container';
      document.body.appendChild(hudElement);
    }
    const mistakeHotkey = (currentSettings.shortcuts && currentSettings.shortcuts.triggerMistake) || 'Alt+M';
    const pauseHotkey = (currentSettings.shortcuts && currentSettings.shortcuts.pauseTyping) || 'Alt+P';
    const isTurbo = currentSettings.speedMode === 'turbo';
    const currentSpeedText = isTurbo ? 'TURBO' : (currentSettings.targetWpm || 75) + ' WPM';

    hudElement.innerHTML = \`
      <div class="autotyper-hud-pill">
        <span class="autotyper-hud-pulse" id="at-hud-pulse-dot"></span>
        <div class="autotyper-hud-info">
          <div class="autotyper-hud-title" id="at-hud-title-text">\${title || 'Auto-Typing...'}</div>
          <div class="autotyper-hud-stats"><span id="at-hud-count">0</span> / \${totalChars} chars</div>
        </div>
        <div class="autotyper-hud-speed-ctrl" title="Adjust typing speed live directly from this page (Alt+[ / Alt+])">
          <button id="at-hud-speed-down" class="at-hud-mini-btn" title="Decrease speed (-10 WPM, Alt+[)">−</button>
          <span id="at-hud-speed-val" class="at-hud-speed-text">\${currentSpeedText}</span>
          <button id="at-hud-speed-up" class="at-hud-mini-btn" title="Increase speed (+10 WPM, Alt+])">+</button>
          <button id="at-hud-turbo-btn" class="at-hud-mini-btn at-hud-turbo-btn \${isTurbo ? 'active' : ''}" title="Toggle Turbo mode">⚡</button>
        </div>
        <button id="at-hud-pause" class="autotyper-hud-btn" style="background:#1e293b;border:1px solid #475569;" title="Pause typing to take a break (\${pauseHotkey})">⏸ Pause</button>
        <button id="at-hud-mistake" class="autotyper-hud-btn" style="background:#b45309;" title="Inject typo mistake right now (\${mistakeHotkey})">+Mistake (\${mistakeHotkey})</button>
        <button id="at-hud-stop" class="autotyper-hud-btn" title="Stop typing (Esc)">Stop</button>
      </div>
    \`;
    hudElement.style.display = 'block';

    const stopBtn = hudElement.querySelector('#at-hud-stop');
    if (stopBtn) {
      stopBtn.onclick = () => {
        if (activeTyperSession) activeTyperSession.cancel();
      };
    }

    const pauseBtn = hudElement.querySelector('#at-hud-pause');
    if (pauseBtn) {
      pauseBtn.onclick = () => {
        if (activeTyperSession) activeTyperSession.togglePause();
      };
    }

    const mistakeBtn = hudElement.querySelector('#at-hud-mistake');
    if (mistakeBtn) {
      mistakeBtn.onclick = () => {
        if (activeTyperSession) activeTyperSession.triggerMistake();
      };
    }

    const speedDownBtn = hudElement.querySelector('#at-hud-speed-down');
    if (speedDownBtn) {
      speedDownBtn.onclick = () => {
        const curWpm = currentSettings.targetWpm || 75;
        currentSettings.targetWpm = Math.max(15, curWpm - 10);
        currentSettings.speedMode = 'human';
        updateHudSpeed();
        browserAPI.storage.local.set({ settings: currentSettings });
      };
    }

    const speedUpBtn = hudElement.querySelector('#at-hud-speed-up');
    if (speedUpBtn) {
      speedUpBtn.onclick = () => {
        const curWpm = currentSettings.targetWpm || 75;
        currentSettings.targetWpm = Math.min(300, curWpm + 10);
        currentSettings.speedMode = 'human';
        updateHudSpeed();
        browserAPI.storage.local.set({ settings: currentSettings });
      };
    }

    const turboBtn = hudElement.querySelector('#at-hud-turbo-btn');
    if (turboBtn) {
      turboBtn.onclick = () => {
        currentSettings.speedMode = currentSettings.speedMode === 'turbo' ? 'human' : 'turbo';
        updateHudSpeed();
        browserAPI.storage.local.set({ settings: currentSettings });
      };
    }
  }

  function updateHudProgress(index, total, isPaused = false, pauseReason = '') {
    if (!hudElement) return;
    const countEl = hudElement.querySelector('#at-hud-count');
    if (countEl) countEl.textContent = index;

    const pauseBtn = hudElement.querySelector('#at-hud-pause');
    if (pauseBtn) {
      if (isPaused) {
        pauseBtn.innerHTML = '<span>▶</span> Resume';
        pauseBtn.style.background = '#059669';
        pauseBtn.style.color = '#ffffff';
        pauseBtn.style.border = 'none';
        pauseBtn.style.fontWeight = '600';
      } else {
        pauseBtn.innerHTML = '<span style="color:#f59e0b;">⏸</span> Pause';
        pauseBtn.style.background = '#1e293b';
        pauseBtn.style.color = '#f8fafc';
        pauseBtn.style.border = '1px solid #475569';
        pauseBtn.style.fontWeight = '500';
      }
    }

    const titleEl = hudElement.querySelector('#at-hud-title-text');
    if (titleEl) {
      if (isPaused) {
        titleEl.textContent = pauseReason ? 'Paused (' + pauseReason + ')' : 'Taking a break (Paused)';
        titleEl.style.color = '#f59e0b';
      } else {
        titleEl.textContent = (activeTyperSession && activeTyperSession.title) || 'Auto-Typing...';
        titleEl.style.color = '#f1f5f9';
      }
    }

    const pulseDot = hudElement.querySelector('#at-hud-pulse-dot');
    if (pulseDot) {
      pulseDot.style.backgroundColor = isPaused ? '#f59e0b' : '#38bdf8';
    }
  }

  function hideHud() {
    if (hudElement) hudElement.style.display = 'none';
  }

  // ---------------------------------------------------------------------------
  // In-page quick snippet palette
  // ---------------------------------------------------------------------------
  function closePalette(restoreFocus) {
    if (!paletteElement) return;
    paletteElement.style.display = 'none';
    if (restoreFocus && paletteReturnTarget && document.contains(paletteReturnTarget)) {
      focusEditable(paletteReturnTarget);
    }
  }

  function selectPaletteSnippet(snippet) {
    const target = paletteReturnTarget;
    closePalette(false);
    if (target && document.contains(target)) {
      typeSnippet(snippet.content, snippet.title, target);
    } else {
      typeSnippet(snippet.content, snippet.title);
    }
  }

  function setPaletteSelection(index) {
    const listEl = paletteElement && paletteElement.querySelector('#at-palette-list');
    if (!listEl) return;
    const items = listEl.querySelectorAll('.at-palette-item');
    if (!items.length) return;

    paletteSelectedIndex = Math.max(0, Math.min(index, items.length - 1));
    items.forEach((item, i) => {
      const selected = i === paletteSelectedIndex;
      item.style.background = selected ? 'rgba(59, 130, 246, 0.18)' : '';
      item.style.borderColor = selected ? 'rgba(59, 130, 246, 0.55)' : '';
    });
    const active = items[paletteSelectedIndex];
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function openSnippetPalette() {
    if (paletteElement && paletteElement.style.display !== 'none') {
      const existingInput = paletteElement.querySelector('#at-palette-search');
      if (existingInput) {
        existingInput.value = '';
        existingInput.focus();
        renderPaletteResults('');
      }
      return;
    }

    // Remember the field the user was editing before the palette steals focus.
    paletteReturnTarget = getActiveEditable();

    if (paletteElement) {
      paletteElement.style.display = 'flex';
      const existingInput = paletteElement.querySelector('#at-palette-search');
      if (existingInput) {
        existingInput.value = '';
        renderPaletteResults('');
        existingInput.focus();
      }
      return;
    }

    paletteElement = document.createElement('div');
    paletteElement.id = 'autotyper-palette-overlay';
    paletteElement.innerHTML = \`
      <div class="at-palette-modal">
        <div class="at-palette-header">
          <input type="text" id="at-palette-search" placeholder="Search snippet by name or tag (↑↓ to select, ↵ to type)..." autocomplete="off" />
          <button id="at-palette-close">✕</button>
        </div>
        <div id="at-palette-list" class="at-palette-list"></div>
        <div class="at-palette-footer">
          <span>AutoTyper Pro · <strong>↑↓</strong> navigate · <strong>↵</strong> type · <strong>Esc</strong> close</span>
        </div>
      </div>
    \`;
    document.body.appendChild(paletteElement);

    const input = paletteElement.querySelector('#at-palette-search');
    const closeBtn = paletteElement.querySelector('#at-palette-close');

    closeBtn.onclick = () => closePalette(true);
    paletteElement.onclick = (e) => {
      if (e.target === paletteElement) closePalette(true);
    };

    input.oninput = (e) => renderPaletteResults(e.target.value);

    input.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePalette(true);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPaletteSelection(paletteSelectedIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPaletteSelection(paletteSelectedIndex - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const snippet = paletteResults[paletteSelectedIndex];
        if (snippet) selectPaletteSnippet(snippet);
      }
    };

    renderPaletteResults('');
    input.focus();
  }

  function renderPaletteResults(query) {
    const listEl = paletteElement && paletteElement.querySelector('#at-palette-list');
    if (!listEl) return;

    const q = String(query || '').toLowerCase();
    paletteResults = currentSnippets.filter((snippet) =>
      !q ||
      snippet.title.toLowerCase().includes(q) ||
      (snippet.tags && snippet.tags.some((tag) => tag.toLowerCase().includes(q))) ||
      (snippet.shortcutTrigger && snippet.shortcutTrigger.toLowerCase().includes(q))
    );

    listEl.innerHTML = '';
    paletteSelectedIndex = 0;

    if (paletteResults.length === 0) {
      listEl.innerHTML = '<div class="at-palette-empty">No matching snippets found</div>';
      return;
    }

    paletteResults.forEach((snippet) => {
      const item = document.createElement('div');
      item.className = 'at-palette-item';
      item.innerHTML = \`
        <div class="at-palette-item-left">
          <div class="at-palette-item-title">\${snippet.title}</div>
          <div class="at-palette-item-tags">\${snippet.tags ? snippet.tags.map((tag) => '#' + tag).join(' ') : ''}</div>
        </div>
        <div class="at-palette-item-right">
          \${snippet.keyboardShortcut ? '<span class="at-palette-badge">' + snippet.keyboardShortcut + '</span>' : ''}
          <button class="at-palette-type-btn">Type</button>
        </div>
      \`;

      item.onclick = () => selectPaletteSnippet(snippet);
      item.onmouseenter = () => setPaletteSelection(paletteResults.indexOf(snippet));
      listEl.appendChild(item);
    });

    setPaletteSelection(0);
  }

  // Common adjacent keys for realistic typo simulation
  const QWERTY_ADJ = {
    a: ['q', 'w', 's', 'z'], b: ['v', 'g', 'h', 'n'], c: ['x', 'd', 'f', 'v'],
    d: ['s', 'e', 'r', 'f', 'c'], e: ['w', 's', 'd', 'r'], f: ['d', 'r', 't', 'g', 'v'],
    g: ['f', 't', 'y', 'h', 'b'], h: ['g', 'y', 'u', 'j', 'n'], i: ['u', 'j', 'k', 'o'],
    j: ['h', 'u', 'i', 'k', 'm'], k: ['j', 'i', 'o', 'l'], l: ['k', 'o', 'p'],
    m: ['n', 'j', 'k'], n: ['b', 'h', 'j', 'm'], o: ['i', 'k', 'l', 'p'],
    p: ['o', 'l'], q: ['w', 'a'], r: ['e', 't', 'f', 'd'], s: ['a', 'w', 'e', 'd', 'x', 'z'],
    t: ['r', 'y', 'g', 'f'], u: ['y', 'i', 'j', 'h'], v: ['c', 'f', 'g', 'b'],
    w: ['q', 'e', 's', 'a'], x: ['z', 's', 'd', 'c'], y: ['t', 'u', 'h', 'g'], z: ['a', 's', 'x']
  };

  // Detect leading whitespace of active line across inputs, textareas, Monaco, CodeMirror, and ContentEditable
  function getActiveLineLeadingIndent(el) {
    if (!el) return '';

    // 1. Monaco Editor (.monaco-editor) - MUST check before textarea because Monaco's active element is textarea.inputarea!
    const monacoContainer = el.closest ? el.closest('.monaco-editor') : null;
    if (monacoContainer) {
      try {
        const cursor = monacoContainer.querySelector('.cursors-layer .cursor');
        if (cursor) {
          const cursorRect = cursor.getBoundingClientRect();
          const viewLines = monacoContainer.querySelectorAll('.view-lines .view-line');
          for (let i = 0; i < viewLines.length; i++) {
            const vl = viewLines[i];
            const vlRect = vl.getBoundingClientRect();
            if (cursorRect.top >= vlRect.top - 2 && cursorRect.top <= vlRect.bottom + 2) {
              const text = (vl.textContent || '').replace(/\\u00a0/g, ' ');
              const match = text.match(/^[ \\t]*/);
              return match ? match[0] : '';
            }
          }
        }
      } catch (e) {}
      return '';
    }

    // 2. CodeMirror 6 (.cm-editor) - MUST check before textarea
    const cmEditor = el.closest ? el.closest('.cm-editor') : null;
    if (cmEditor) {
      try {
        const activeLine = cmEditor.querySelector('.cm-activeLine');
        if (activeLine) {
          const text = (activeLine.textContent || '').replace(/\\u00a0/g, ' ');
          const match = text.match(/^[ \\t]*/);
          return match ? match[0] : '';
        }
      } catch (e) {}
      return '';
    }

    // 3. CodeMirror 5 (.CodeMirror) - MUST check before textarea
    const cm5 = el.closest ? el.closest('.CodeMirror') : null;
    if (cm5) {
      try {
        const cursor = cm5.querySelector('.CodeMirror-cursor');
        if (cursor) {
          const cursorRect = cursor.getBoundingClientRect();
          const lines = cm5.querySelectorAll('.CodeMirror-line');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineRect = line.getBoundingClientRect();
            if (cursorRect.top >= lineRect.top - 2 && cursorRect.top <= lineRect.bottom + 2) {
              const text = (line.textContent || '').replace(/\\u00a0/g, ' ');
              const match = text.match(/^[ \\t]*/);
              return match ? match[0] : '';
            }
          }
        }
      } catch (e) {}
      return '';
    }

    // 4. Ace Editor (.ace_editor)
    const aceEditor = el.closest ? el.closest('.ace_editor') : null;
    if (aceEditor) {
      try {
        const activeLine = aceEditor.querySelector('.ace_line.ace_active-line, .ace_active-line');
        if (activeLine) {
          const text = (activeLine.textContent || '').replace(/\\u00a0/g, ' ');
          const match = text.match(/^[ \\t]*/);
          return match ? match[0] : '';
        }
      } catch (e) {}
      return '';
    }

    // 5. Standard Input or Textarea (only if not inside a specialized code editor above)
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      const pos = el.selectionStart ?? el.value.length;
      const textBefore = el.value.slice(0, pos);
      const lastLine = textBefore.split('\\n').pop() || '';
      const match = lastLine.match(/^[ \\t]*/);
      return match ? match[0] : '';
    }

    // 6. ContentEditable
    if (el.isContentEditable) {
      try {
        const sel = window.getSelection();
        if (sel && sel.anchorNode) {
          let node = sel.anchorNode;
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            const offset = sel.anchorOffset;
            const before = text.slice(0, offset);
            const match = before.match(/(?:^|\\n)([ \\t]*)$/);
            return match ? match[1] : '';
          }
        }
      } catch (e) {}
    }

    return '';
  }

  // High-fidelity character typist with safe event dispatches and manual mistake override
  async function typeSnippet(text, title = 'Auto-Typing', targetOverride = null) {
    try {
      const target = targetOverride || getActiveEditable();
      if (!target) {
        console.warn('[AutoTyper Pro] Please click into an editable input or text field first.');
        return;
      }

      if (activeTyperSession) {
        activeTyperSession.cancel();
      }

      const processedText = interpolateTags(String(text || ''));
      if (!processedText) return;

      // Make sure events and execCommand target the intended field.
      focusEditable(target);

      let cancelled = false;
      let isPaused = false;
      let pausedDueToFocusLoss = false;
      let resolvePause = null;
      let pauseStartTime = 0;
      let totalPausedMs = 0;
      let manualMistakeRequested = false;
      const emitKeyEvents = currentSettings.antiPasteBypass !== false;
      let currentIdx = 0;

      const wait = async (ms) => {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, ms));
        while (isPaused && !cancelled) {
          await new Promise((resolve) => {
            resolvePause = resolve;
          });
        }
      };

      const pause = (reason = '') => {
        if (!isPaused) {
          isPaused = true;
          pauseStartTime = Date.now();
          updateHudProgress(currentIdx, processedText.length, true, reason);
        }
      };

      const resume = () => {
        if (isPaused) {
          isPaused = false;
          if (pauseStartTime > 0) {
            totalPausedMs += Date.now() - pauseStartTime;
            pauseStartTime = 0;
          }
          if (resolvePause) {
            resolvePause();
            resolvePause = null;
          }
          updateHudProgress(currentIdx, processedText.length, false);
        }
      };

      const togglePause = () => {
        if (isPaused) {
          resume();
          return false;
        } else {
          pause('Manual');
          return true;
        }
      };

      // Visibility & blur listeners to auto-pause when tab is backgrounded
      const onVisibilityChange = () => {
        if (document.hidden) {
          if (!isPaused && !cancelled) {
            pausedDueToFocusLoss = true;
            pause('Tab Inactive');
          }
        } else {
          if (pausedDueToFocusLoss && !cancelled) {
            pausedDueToFocusLoss = false;
            focusEditable(target);
            setTimeout(() => {
              if (!cancelled && !document.hidden) {
                focusEditable(target);
                resume();
              }
            }, 150);
          }
        }
      };

      const onWindowBlur = () => {
        if (!isPaused && !cancelled) {
          pausedDueToFocusLoss = true;
          pause('Focus Lost');
        }
      };

      const onWindowFocus = () => {
        if (pausedDueToFocusLoss && !cancelled) {
          pausedDueToFocusLoss = false;
          focusEditable(target);
          setTimeout(() => {
            if (!cancelled) {
              focusEditable(target);
              resume();
            }
          }, 150);
        }
      };

      const cleanup = () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('blur', onWindowBlur);
        window.removeEventListener('focus', onWindowFocus);
      };

      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('blur', onWindowBlur);
      window.addEventListener('focus', onWindowFocus);

      activeTyperSession = {
        title,
        cancel: () => {
          cancelled = true;
          if (resolvePause) {
            resolvePause();
            resolvePause = null;
          }
          cleanup();
          hideHud();
          activeTyperSession = null;
        },
        pause,
        resume,
        togglePause,
        isPaused: () => isPaused,
        triggerMistake: () => {
          if (currentSettings.mistakeMode === 'disabled') return;
          manualMistakeRequested = true;
        }
      };

      showHud(title, processedText.length);

      for (let i = 0; i < processedText.length; i++) {
        if (cancelled) break;
        currentIdx = i + 1;

        const char = processedText[i];
        const isEnter = char === '\\n';
        const isSpace = char === ' ';

        // Check for mistake (manual button/hotkey, or automatic only if chosen)
        const isAutoMistake = currentSettings.mistakeMode === 'automatic' &&
          !isEnter && !isSpace && (Math.random() * 100 < (currentSettings.typoRatePercent || 2));

        const shouldMistake = (!isEnter && !isSpace) && (manualMistakeRequested || isAutoMistake);

        if (shouldMistake) {
          manualMistakeRequested = false;
          const lower = char.toLowerCase();
          const adj = QWERTY_ADJ[lower];
          if (adj && adj.length > 0) {
            const picked = adj[Math.floor(Math.random() * adj.length)];
            const typoChar = char === char.toUpperCase() ? picked.toUpperCase() : picked;
            const typoSpec = getKeystrokeSpec(typoChar);

            // 1. Insert typo
            if (emitKeyEvents) {
              target.dispatchEvent(new KeyboardEvent('keydown', {
                key: typoSpec.key, code: typoSpec.code, keyCode: typoSpec.keyCode,
                which: typoSpec.keyCode, bubbles: true, cancelable: true, composed: true,
                ctrlKey: false, altKey: false, metaKey: false, shiftKey: typoSpec.shiftKey
              }));
            }

            try {
              target.dispatchEvent(new InputEvent('beforeinput', {
                data: typoChar, inputType: 'insertText', bubbles: true, cancelable: true, composed: true
              }));
            } catch (e) {}

            let typoInserted = false;
            try {
              typoInserted = document.execCommand('insertText', false, typoChar);
            } catch (e) {
              typoInserted = false;
            }
            if (!typoInserted) insertTextAtCaret(target, typoChar);

            if (emitKeyEvents) {
              target.dispatchEvent(new KeyboardEvent('keyup', {
                key: typoSpec.key, code: typoSpec.code, keyCode: typoSpec.keyCode,
                which: typoSpec.keyCode, bubbles: true, cancelable: true, composed: true,
                ctrlKey: false, altKey: false, metaKey: false, shiftKey: typoSpec.shiftKey
              }));
            }
            playKeySound(false, false);

            // 2. Pause in realization
            await wait(140 + Math.random() * 80);
            if (cancelled) break;

            // 3. Backspace
            if (emitKeyEvents) {
              target.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8,
                bubbles: true, cancelable: true, composed: true,
                ctrlKey: false, altKey: false, metaKey: false, shiftKey: false
              }));
            }

            let bsDeleted = false;
            try {
              bsDeleted = document.execCommand('delete', false);
            } catch (e) {
              bsDeleted = false;
            }
            if (!bsDeleted) deleteCharBeforeCaret(target);

            if (emitKeyEvents) {
              target.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8,
                bubbles: true, cancelable: true, composed: true,
                ctrlKey: false, altKey: false, metaKey: false, shiftKey: false
              }));
            }

            // 4. Pause before typing the correct key
            await wait(100 + Math.random() * 60);
            if (cancelled) break;
          }
        }

        const spec = getKeystrokeSpec(char);

        if (emitKeyEvents) {
          // keydown (STRICTLY ctrlKey: false, altKey: false, metaKey: false)
          target.dispatchEvent(new KeyboardEvent('keydown', {
            key: spec.key, code: spec.code, keyCode: spec.keyCode, which: spec.keyCode,
            bubbles: true, cancelable: true, composed: true,
            ctrlKey: false, altKey: false, metaKey: false,
            shiftKey: spec.shiftKey
          }));

          // keypress
          target.dispatchEvent(new KeyboardEvent('keypress', {
            key: spec.key, code: spec.code, keyCode: spec.keyCode, which: spec.keyCode,
            bubbles: true, cancelable: true, composed: true,
            ctrlKey: false, altKey: false, metaKey: false,
            shiftKey: spec.shiftKey,
            charCode: spec.charCode
          }));
        }

        // beforeinput
        try {
          target.dispatchEvent(new InputEvent('beforeinput', {
            data: isEnter ? null : char,
            inputType: isEnter ? 'insertLineBreak' : 'insertText',
            bubbles: true, cancelable: true, composed: true
          }));
        } catch (e) {}

        // Insert character (native execCommand first for Monaco/CodeMirror compatibility)
        let inserted = false;
        try {
          inserted = document.execCommand('insertText', false, isEnter ? '\\n' : char);
        } catch (e) {
          inserted = false;
        }
        if (!inserted) {
          insertTextAtCaret(target, isEnter ? '\\n' : char);
        }

        if (emitKeyEvents) {
          // keyup
          target.dispatchEvent(new KeyboardEvent('keyup', {
            key: spec.key, code: spec.code, keyCode: spec.keyCode, which: spec.keyCode,
            bubbles: true, cancelable: true, composed: true,
            ctrlKey: false, altKey: false, metaKey: false,
            shiftKey: spec.shiftKey
          }));
        }

        playKeySound(isSpace, isEnter);

        // SMART CODE INDENTATION RECONCILIATION
        // When Enter is typed, web code editors auto-indent. Reconcile editor's indent with snippet to prevent cascading blowout.
        // We only skip typing redundant whitespace already inserted by the editor.
        // NEVER send Backspaces on Enter: doing so erases newlines and destroys previous lines.
        if (isEnter) {
          await wait(20);
          if (cancelled) break;

          const editorIndent = getActiveLineLeadingIndent(target);
          let snippetIndent = '';
          let lookahead = i + 1;
          while (lookahead < processedText.length && (processedText[lookahead] === ' ' || processedText[lookahead] === '\\t')) {
            snippetIndent += processedText[lookahead];
            lookahead++;
          }

          if (editorIndent.length > 0 && snippetIndent.length > 0) {
            if (snippetIndent.startsWith(editorIndent)) {
              // Skip duplicate typing of whitespace already inserted by editor
              i += editorIndent.length;
            } else {
              // Normalize tabs vs spaces (1 tab = 4 spaces)
              const normEditor = editorIndent.replace(/\\t/g, '    ');
              const normSnippet = snippetIndent.replace(/\\t/g, '    ');
              if (normSnippet.startsWith(normEditor)) {
                let consumed = 0;
                let acc = '';
                while (i + 1 + consumed < processedText.length && acc.length < normEditor.length) {
                  const ch = processedText[i + 1 + consumed];
                  acc += ch === '\\t' ? '    ' : ch;
                  consumed++;
                }
                if (acc === normEditor) {
                  i += consumed;
                }
              }
            }
          }
        }

        updateHudProgress(i + 1, processedText.length, isPaused);

        await wait(calculateCharacterDelay(char));
      }

      cleanup();
      hideHud();
      activeTyperSession = null;
    } catch (err) {
      console.error('[AutoTyper Pro] Typing failed:', err);
      hideHud();
      activeTyperSession = null;
    }
  }

  // Intercept Paste when setting is enabled
  document.addEventListener('paste', async (e) => {
    if (!currentSettings.autoTypeOnPaste) return;
    const target = getActiveEditable();
    if (!target) return;

    const clipText = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (clipText && clipText.length > 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      typeSnippet(clipText, 'Auto-Typing Paste');
    }
  }, true);

  // In-Page Custom Keyboard Shortcuts Listener
  document.addEventListener('keydown', async (e) => {
    // Crucial: Ignore synthetic events generated by AutoTyper itself to avoid loopbacks
    if (!e.isTrusted) return;

    const shortcuts = currentSettings.shortcuts || {};

    // 1. Emergency Stop Shortcut
    if (matchesShortcut(e, shortcuts.stopTyping || 'Escape') || (e.key === 'Escape' && currentSettings.stopOnEscape)) {
      if (activeTyperSession) {
        e.preventDefault();
        activeTyperSession.cancel();
        return;
      }
    }

    // 1b. Pause / Resume Shortcut (default Alt+P)
    if (matchesShortcut(e, shortcuts.pauseTyping || 'Alt+P')) {
      if (activeTyperSession) {
        e.preventDefault();
        activeTyperSession.togglePause();
        return;
      }
    }

    // 1c. Live On-Page Speed Adjustment Shortcuts (Alt+[ and Alt+])
    if (e.altKey && e.key === '[') {
      const curWpm = currentSettings.targetWpm || 75;
      currentSettings.targetWpm = Math.max(15, curWpm - 10);
      currentSettings.speedMode = 'human';
      updateHudSpeed();
      browserAPI.storage.local.set({ settings: currentSettings });
      e.preventDefault();
      return;
    }
    if (e.altKey && e.key === ']') {
      const curWpm = currentSettings.targetWpm || 75;
      currentSettings.targetWpm = Math.min(300, curWpm + 10);
      currentSettings.speedMode = 'human';
      updateHudSpeed();
      browserAPI.storage.local.set({ settings: currentSettings });
      e.preventDefault();
      return;
    }

    // 2. Manual Mistake Trigger during auto-typing (e.g. Alt+M)
    if (matchesShortcut(e, shortcuts.triggerMistake || 'Alt+M')) {
      if (activeTyperSession) {
        e.preventDefault();
        activeTyperSession.triggerMistake();
        return;
      }
    }

    // 3. Open Snippet Command Palette Shortcut (default Alt+K)
    if (matchesShortcut(e, shortcuts.openSnippetPicker || 'Alt+K')) {
      e.preventDefault();
      openSnippetPalette();
      return;
    }

    // 3. Open Snippet Manager Shortcut (e.g. Alt+Shift+O)
    if (matchesShortcut(e, shortcuts.openSnippetManager || 'Alt+Shift+O')) {
      e.preventDefault();
      browserAPI.runtime.sendMessage({ action: 'OPEN_OPTIONS_PAGE' });
      return;
    }

    // 4. Auto-Type Clipboard Shortcut (e.g. Alt+Shift+V)
    if (matchesShortcut(e, shortcuts.autoTypeClipboard || 'Alt+Shift+V')) {
      e.preventDefault();
      requestClipboardText().then((text) => {
        if (text) {
          typeSnippet(text, 'Clipboard Text');
        } else {
          notifyUser('Clipboard access was denied. Try the toolbar popup, or grant clipboard permission.');
        }
      });
      return;
    }

    // 5. Per-Snippet Custom Keyboard Shortcuts (e.g. Alt+1, Ctrl+Alt+S, etc.)
    for (const snip of currentSnippets) {
      if (snip.keyboardShortcut && matchesShortcut(e, snip.keyboardShortcut)) {
        e.preventDefault();
        typeSnippet(snip.content, snip.title);
        return;
      }
    }

    // 6. Shortcut Prefix Expansion (e.g. typing ':sig' followed by Tab or Space)
    const triggerKey = currentSettings.quickTriggerKey || 'Tab';
    if (e.key === triggerKey || (triggerKey === 'Tab' && e.key === 'Tab') || (triggerKey === 'Space' && e.key === ' ')) {
      const target = getActiveEditable();
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        const pos = target.selectionStart;
        const textBefore = target.value.slice(0, pos);
        const match = textBefore.match(/(:[a-zA-Z0-9_-]+|![a-zA-Z0-9_-]+)$/);
        if (match) {
          const trigger = match[1];
          const found = currentSnippets.find(s => s.shortcutTrigger === trigger);
          if (found) {
            e.preventDefault();
            const start = pos - trigger.length;
            target.value = target.value.slice(0, start) + target.value.slice(pos);
            target.selectionStart = target.selectionEnd = start;
            typeSnippet(found.content, found.title);
          }
        }
      }
    }
  }, true);

  // Message listener from popup/background
  browserAPI.runtime.onMessage.addListener((message) => {
    if (message.action === 'AUTO_TYPE_TEXT') {
      typeSnippet(message.text, message.title);
    } else if (message.action === 'AUTO_TYPE_CLIPBOARD') {
      requestClipboardText().then((text) => {
        if (text) {
          typeSnippet(text, 'Clipboard Text');
        } else {
          notifyUser('Clipboard access was denied. Open the toolbar popup and try again.');
        }
      });
    } else if (message.action === 'OPEN_SNIPPET_PICKER') {
      openSnippetPalette();
    } else if (message.action === 'STOP_TYPING') {
      if (activeTyperSession) activeTyperSession.cancel();
    }
  });
})();
`;

  // 4. content.css
  const contentCss = `/* AutoTyper Pro - In-page HUD styling */
#autotyper-hud-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  pointer-events: auto;
}

.autotyper-hud-pill {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #0f172a;
  color: #f8fafc;
  border: 1px solid #334155;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
  padding: 8px 16px;
  border-radius: 9999px;
  font-size: 13px;
  line-height: 1.2;
}

.autotyper-hud-pulse {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background-color: #38bdf8;
  animation: at-pulse 1.4s infinite;
}

@keyframes at-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}

.autotyper-hud-info {
  display: flex;
  flex-direction: column;
}

.autotyper-hud-title {
  font-weight: 600;
  color: #f1f5f9;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.autotyper-hud-stats {
  font-size: 11px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.autotyper-hud-btn {
  background: #334155;
  color: #f8fafc;
  border: none;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

#at-hud-stop:hover {
  background: #dc2626;
  color: #ffffff;
}

#at-hud-pause:hover {
  background: #475569;
  color: #ffffff;
}

.autotyper-hud-speed-ctrl {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 2px 4px;
}

.at-hud-mini-btn {
  background: transparent;
  color: #94a3b8;
  border: none;
  border-radius: 4px;
  width: 18px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
  transition: all 0.15s ease;
}

.at-hud-mini-btn:hover {
  background: #334155;
  color: #f8fafc;
}

.at-hud-speed-text {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 600;
  color: #818cf8;
  min-width: 52px;
  text-align: center;
  user-select: none;
}

.at-hud-turbo-btn {
  font-size: 11px;
  color: #f59e0b;
}

.at-hud-turbo-btn.active {
  background: rgba(245, 158, 11, 0.25);
  color: #fbbf24;
}

/* In-Page Quick Snippet Command Palette Overlay */
#autotyper-palette-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  z-index: 2147483646;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.at-palette-modal {
  width: 540px;
  max-width: 90vw;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 14px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.at-palette-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #1e293b;
  background: #090d16;
}

.at-palette-header input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #f8fafc;
  font-size: 14px;
}

.at-palette-header button {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
}

.at-palette-header button:hover {
  color: #ffffff;
}

.at-palette-list {
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.at-palette-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px;
  background: #111827;
  border: 1px solid #1f2937;
  cursor: pointer;
  transition: all 0.15s ease;
}

.at-palette-item:hover {
  background: #1e293b;
  border-color: #3b82f6;
}

.at-palette-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
}

.at-palette-item-tags {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.at-palette-item-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.at-palette-badge {
  font-size: 10px;
  font-family: monospace;
  background: #1e1b4b;
  color: #a5b4fc;
  border: 1px solid #4338ca;
  padding: 2px 6px;
  border-radius: 4px;
}

.at-palette-type-btn {
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.at-palette-empty {
  text-align: center;
  padding: 24px;
  color: #64748b;
  font-size: 13px;
}

.at-palette-footer {
  padding: 8px 16px;
  border-top: 1px solid #1e293b;
  background: #090d16;
  font-size: 11px;
  color: #64748b;
}
`;

  // 5. popup.html
  const popupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AutoTyper Pro</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 380px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #090d16;
      color: #e2e8f0;
      padding: 16px;
      font-size: 13px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #1e293b;
    }
    .brand {
      font-weight: 700;
      font-size: 15px;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .action-btn {
      width: 100%;
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 10px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 10px;
      transition: background 0.15s;
    }
    .action-btn:hover { background: #1d4ed8; }
    .search-input {
      width: 100%;
      background: #1e293b;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 10px;
      outline: none;
    }
    .search-input:focus { border-color: #3b82f6; }
    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 8px;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
    }
    .snippets-list {
      max-height: 250px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }
    .snippet-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #111827;
      border: 1px solid #1f2937;
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .snippet-item:hover {
      background: #1e293b;
      border-color: #3b82f6;
    }
    .snip-info {
      flex: 1;
      min-width: 0;
      margin-right: 8px;
    }
    .snip-title {
      font-weight: 500;
      color: #f8fafc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .snip-tags {
      font-size: 10px;
      color: #94a3b8;
      margin-top: 1px;
    }
    .snip-meta {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .snip-badge {
      font-size: 10px;
      font-family: monospace;
      color: #38bdf8;
      background: #082f49;
      border: 1px solid #0369a1;
      padding: 1px 5px;
      border-radius: 3px;
    }
    .snip-btn {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 4px 10px;
      font-size: 11px;
      border-radius: 4px;
      cursor: pointer;
    }
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 10px;
      border-top: 1px solid #1e293b;
      font-size: 11px;
      color: #94a3b8;
    }
    .footer a {
      color: #38bdf8;
      text-decoration: none;
      cursor: pointer;
    }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <span>⌨️</span> AutoTyper Pro
    </div>
    <span style="font-size: 11px; color: #94a3b8;">v1.2.0</span>
  </div>

  <button id="btn-type-clipboard" class="action-btn">
    <span>📋</span> Auto-Type Clipboard (<span id="clip-shortcut-label">Alt+Shift+V</span>)
  </button>

  <div id="error-banner" style="display:none; margin-bottom:10px; padding:8px 10px; background:#450a0a; border:1px solid #dc2626; border-radius:6px; font-size:11px; color:#fecaca; line-height:1.4;"></div>

  <input type="text" id="snippet-search" class="search-input" placeholder="Search by name, tag (#work), or trigger..." />

  <div class="section-title">
    <span>Snippets</span>
    <span id="snip-count">0 items</span>
  </div>
  <div id="snippets-container" class="snippets-list"></div>

  <div class="footer">
    <span id="speed-label">Speed: 75 WPM</span>
    <a id="link-options" href="#">Snippet Manager &amp; Shortcuts</a>
  </div>

  <script src="popup.js"></script>
</body>
</html>
`;

  // 6. popup.js
  const popupJs = `/**
 * AutoTyper Pro - Popup Controller
 */
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('snippets-container');
  const searchInput = document.getElementById('snippet-search');
  const clipboardBtn = document.getElementById('btn-type-clipboard');
  const speedLabel = document.getElementById('speed-label');
  const optionsLink = document.getElementById('link-options');
  const countLabel = document.getElementById('snip-count');
  const clipShortcutLabel = document.getElementById('clip-shortcut-label');
  const errorBanner = document.getElementById('error-banner');

  const data = await browserAPI.storage.local.get(['snippets', 'settings']);
  const snippets = data.snippets || [];
  const settings = data.settings || {};

  if (settings.shortcuts && settings.shortcuts.autoTypeClipboard) {
    clipShortcutLabel.textContent = settings.shortcuts.autoTypeClipboard;
  }

  if (settings.targetWpm) {
    speedLabel.textContent = 'Speed: ' + settings.targetWpm + ' WPM';
  }

  // Reliable message delivery with dynamic injection for tabs loaded before extension install/reload
  async function sendToActiveTab(message) {
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;

    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('edge://') || tab.url.startsWith('opera://'))) {
      if (errorBanner) {
        errorBanner.textContent = 'AutoTyper cannot run on browser system pages. Please switch to a webpage (e.g. OneCompiler, Google Docs, etc.).';
        errorBanner.style.display = 'block';
      }
      return;
    }

    try {
      await browserAPI.tabs.sendMessage(tab.id, message);
      window.close();
    } catch (err) {
      console.warn('Initial message failed, injecting content script into tab frames...', err);
      try {
        if (browserAPI.scripting && browserAPI.scripting.executeScript) {
          await browserAPI.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ['content.js']
          });
          await browserAPI.scripting.insertCSS({
            target: { tabId: tab.id, allFrames: true },
            files: ['content.css']
          });
        } else if (browserAPI.tabs.executeScript) {
          await browserAPI.tabs.executeScript(tab.id, { file: 'content.js', allFrames: true });
          await browserAPI.tabs.insertCSS(tab.id, { file: 'content.css', allFrames: true });
        }
        await new Promise(r => setTimeout(r, 120));
        await browserAPI.tabs.sendMessage(tab.id, message);
        window.close();
      } catch (injectionErr) {
        console.error('AutoTyper could not connect to this tab:', injectionErr);
        if (errorBanner) {
          errorBanner.textContent = 'Please reload this webpage once so AutoTyper can connect, then click Type.';
          errorBanner.style.display = 'block';
        }
      }
    }
  }

  function renderSnippets(items) {
    container.innerHTML = '';
    countLabel.textContent = items.length + ' items';
    if (items.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: #64748b; padding: 16px;">No snippets match</div>';
      return;
    }

    items.forEach(snip => {
      const row = document.createElement('div');
      row.className = 'snippet-item';
      row.innerHTML = \`
        <div class="snip-info">
          <div class="snip-title">\${snip.title}</div>
          <div class="snip-tags">\${snip.tags ? snip.tags.map(t => '#' + t).join(' ') : ''}</div>
        </div>
        <div class="snip-meta">
          \${snip.keyboardShortcut ? '<span class="snip-badge">' + snip.keyboardShortcut + '</span>' : ''}
          <button class="snip-btn">Type</button>
        </div>
      \`;

      row.onclick = () => {
        sendToActiveTab({
          action: 'AUTO_TYPE_TEXT',
          text: snip.content,
          title: snip.title
        });
      };

      container.appendChild(row);
    });
  }

  renderSnippets(snippets);

  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = snippets.filter(s =>
      s.title.toLowerCase().includes(q) ||
      (s.shortcutTrigger && s.shortcutTrigger.toLowerCase().includes(q)) ||
      (s.tags && s.tags.some(t => t.toLowerCase().includes(q))) ||
      s.content.toLowerCase().includes(q)
    );
    renderSnippets(filtered);
  });

  clipboardBtn.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          sendToActiveTab({ action: 'AUTO_TYPE_TEXT', text, title: 'Clipboard Text' });
          return;
        }
      }
    } catch (err) {
      console.warn('[AutoTyper Pro] Popup clipboard read failed:', err);
    }
    // Fall back to the background/content-script clipboard path.
    sendToActiveTab({ action: 'AUTO_TYPE_CLIPBOARD' });
  });

  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (browserAPI.runtime.openOptionsPage) {
      browserAPI.runtime.openOptionsPage();
    } else {
      window.open('options.html');
    }
  });
});
`;

  // 7. options.html (Full Snippet Management & Custom Shortcut Configuration)
  const optionsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AutoTyper Pro - Snippet Manager &amp; Keyboard Shortcuts</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0b0f19;
      color: #f1f5f9;
      padding: 32px;
      max-width: 960px;
      margin: 0 auto;
      line-height: 1.5;
    }
    h1 { font-size: 24px; font-weight: 700; color: #ffffff; }
    p.subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .card h2 { font-size: 16px; margin-bottom: 16px; color: #f8fafc; border-bottom: 1px solid #1f2937; padding-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .form-group {
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    label { font-size: 13px; font-weight: 600; color: #cbd5e1; }
    .hint { font-size: 12px; color: #64748b; }
    input[type="text"], input[type="number"], select, textarea {
      background: #1e293b;
      border: 1px solid #334155;
      color: #f8fafc;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 13px;
      outline: none;
    }
    input:focus, textarea:focus, select:focus {
      border-color: #3b82f6;
    }
    .slider-row {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    input[type="range"] { flex: 1; accent-color: #3b82f6; }
    .badge-val { font-family: monospace; font-size: 13px; min-width: 60px; }
    .btn-primary {
      background: #2563eb;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.15s;
    }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-secondary {
      background: #334155;
      color: #fff;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.15s;
    }
    .btn-secondary:hover { background: #475569; }
    .btn-danger {
      background: #991b1b;
      color: #fee2e2;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }
    .btn-danger:hover { background: #dc2626; }
    
    /* Shortcuts Grid */
    .shortcuts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
    .shortcut-card {
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 8px;
      padding: 12px 16px;
    }
    .shortcut-card-title {
      font-size: 13px;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 2px;
    }
    .shortcut-card-desc {
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    .recorder-btn {
      width: 100%;
      background: #1e293b;
      border: 1px solid #334155;
      color: #38bdf8;
      font-family: monospace;
      padding: 8px 12px;
      border-radius: 6px;
      text-align: left;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .recorder-btn.listening {
      border-color: #38bdf8;
      background: #082f49;
      animation: pulse 1s infinite alternate;
    }

    /* Snippet Table */
    .filter-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .tag-chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .tag-chip {
      background: #1e293b;
      color: #94a3b8;
      border: 1px solid #334155;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }
    .tag-chip.active {
      background: #2563eb;
      color: #fff;
      border-color: #2563eb;
    }
    .snippets-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .snippets-table th, .snippets-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #1f2937;
      text-align: left;
    }
    .snippets-table th { color: #94a3b8; font-weight: 600; }
    .badge {
      display: inline-block;
      font-family: monospace;
      font-size: 11px;
      background: #082f49;
      color: #38bdf8;
      border: 1px solid #0369a1;
      padding: 2px 6px;
      border-radius: 4px;
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-content {
      background: #111827;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 24px;
      width: 580px;
      max-width: 90vw;
    }
  </style>
</head>
<body>
  <h1>AutoTyper Pro Configuration</h1>
  <p class="subtitle">Customize keyboard shortcuts, typing velocity, and manage snippet library.</p>

  <!-- CARD 1: KEYBOARD SHORTCUTS -->
  <div class="card">
    <h2>
      <span>Custom Keyboard Shortcuts</span>
      <span class="hint">Click any field and press your key combo</span>
    </h2>
    <div class="shortcuts-grid">
      <div class="shortcut-card">
        <div class="shortcut-card-title">Auto-Type Clipboard</div>
        <div class="shortcut-card-desc">Simulates typing the current clipboard text into any focused field</div>
        <button id="sc-clipboard" class="recorder-btn" data-key="autoTypeClipboard">
          <span class="sc-val">Alt+Shift+V</span>
          <span class="hint">Click to edit</span>
        </button>
      </div>

      <div class="shortcut-card">
        <div class="shortcut-card-title">In-Page Snippet Command Palette</div>
        <div class="shortcut-card-desc">Opens the floating snippet search overlay on any active webpage</div>
        <button id="sc-picker" class="recorder-btn" data-key="openSnippetPicker">
          <span class="sc-val">Alt+K</span>
          <span class="hint">Click to edit</span>
        </button>
      </div>

      <div class="shortcut-card">
        <div class="shortcut-card-title">Open Snippet Manager</div>
        <div class="shortcut-card-desc">Instantly opens this settings and snippet management page</div>
        <button id="sc-manager" class="recorder-btn" data-key="openSnippetManager">
          <span class="sc-val">Alt+Shift+O</span>
          <span class="hint">Click to edit</span>
        </button>
      </div>

      <div class="shortcut-card">
        <div class="shortcut-card-title">Emergency Stop Typing</div>
        <div class="shortcut-card-desc">Immediately aborts any ongoing simulated typing session</div>
        <button id="sc-stop" class="recorder-btn" data-key="stopTyping">
          <span class="sc-val">Escape</span>
          <span class="hint">Click to edit</span>
        </button>
      </div>

      <div class="shortcut-card">
        <div class="shortcut-card-title">Trigger Manual Mistake</div>
        <div class="shortcut-card-desc">Simulates a natural typo, pause, and backspace correction during typing</div>
        <button id="sc-mistake" class="recorder-btn" data-key="triggerMistake">
          <span class="sc-val">Alt+M</span>
          <span class="hint">Click to edit</span>
        </button>
      </div>

      <div class="shortcut-card">
        <div class="shortcut-card-title">Pause / Resume Typing</div>
        <div class="shortcut-card-desc">Temporarily freeze or resume active typing session</div>
        <button id="sc-pause" class="recorder-btn" data-key="pauseTyping">
          <span class="sc-val">Alt+P</span>
          <span class="hint">Click to edit</span>
        </button>
      </div>
    </div>
  </div>

  <!-- CARD 2: SNIPPET MANAGEMENT -->
  <div class="card">
    <h2>
      <span>Snippet Management System</span>
      <div style="display: flex; gap: 8px;">
        <button id="btn-add-snip" class="btn-primary">+ Add New Snippet</button>
        <button id="btn-export-json" class="btn-secondary">Export JSON</button>
      </div>
    </h2>

    <div class="filter-bar">
      <input type="text" id="search-snips" placeholder="Search by name, content, or tag (#email)..." style="min-width: 280px;" />
      <div id="tag-filters" class="tag-chips"></div>
    </div>

    <table class="snippets-table">
      <thead>
        <tr>
          <th>Snippet Name</th>
          <th>Tags</th>
          <th>Trigger</th>
          <th>Custom Shortcut</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="snippets-rows"></tbody>
    </table>
  </div>

  <!-- CARD 3: SPEED & HEURISTICS -->
  <div class="card">
    <h2>Typing Engine Speed &amp; Heuristics</h2>
    <div class="form-group">
      <label>Target Velocity: <span id="wpm-display" class="badge-val">75 WPM</span></label>
      <div class="slider-row">
        <input type="range" id="targetWpm" min="20" max="300" value="75">
      </div>
    </div>

    <div class="form-group">
      <label>Human Jitter / Variance: <span id="jitter-display" class="badge-val">35%</span></label>
      <div class="slider-row">
        <input type="range" id="jitterPercent" min="0" max="80" value="35">
      </div>
    </div>

    <div class="form-group" style="margin-top: 14px;">
      <label>Typing Speed Mode</label>
      <select id="speedMode">
        <option value="human">Human (WPM-based with jitter)</option>
        <option value="steady">Steady (fixed base delay)</option>
        <option value="turbo">Turbo (fastest)</option>
        <option value="custom">Custom (fixed delay + jitter)</option>
      </select>
      <span class="hint">Steady and Custom use the base delay below. Turbo ignores jitter.</span>
    </div>

    <div class="form-group">
      <label>Base Delay per Character: <span id="baseDelay-display" class="badge-val">45 ms</span></label>
      <div class="slider-row">
        <input type="range" id="baseDelayMs" min="5" max="250" value="45">
      </div>
    </div>

    <div class="form-group" style="margin-top: 14px;">
      <label>Mistake &amp; Typo Mode</label>
      <div style="display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap;">
        <label style="display: flex; align-items: center; gap: 6px; font-weight: normal; background: #1e293b; padding: 8px 12px; border-radius: 6px; cursor: pointer; border: 1px solid #334155; font-size: 12px;">
          <input type="radio" name="mistakeMode" value="manual" id="mm-manual">
          <span><strong>Manual Override</strong> (Alt+M or +Mistake button - Recommended)</span>
        </label>
        <label style="display: flex; align-items: center; gap: 6px; font-weight: normal; background: #1e293b; padding: 8px 12px; border-radius: 6px; cursor: pointer; border: 1px solid #334155; font-size: 12px;">
          <input type="radio" name="mistakeMode" value="disabled" id="mm-disabled">
          <span><strong>100% Flawless</strong> (No typos)</span>
        </label>
        <label style="display: flex; align-items: center; gap: 6px; font-weight: normal; background: #1e293b; padding: 8px 12px; border-radius: 6px; cursor: pointer; border: 1px solid #334155; font-size: 12px;">
          <input type="radio" name="mistakeMode" value="automatic" id="mm-auto">
          <span><strong>Random Heuristic</strong></span>
        </label>
      </div>
      <span class="hint" style="margin-top: 4px;">Manual mode avoids unexpected typos in online code editors like OneCompiler/Monaco, but lets you trigger realistic typos anytime via shortcut or the floating HUD.</span>
    </div>

    <div class="form-group" style="margin-top: 12px; display: flex; flex-direction: row; gap: 12px; align-items: center;">
      <input type="checkbox" id="autoTypeOnPaste">
      <label for="autoTypeOnPaste" style="font-weight: normal; cursor: pointer;">
        Intercept Ctrl+V / Paste events and auto-type clipboard text instead
      </label>
    </div>

    <div class="form-group" style="margin-top: 12px; display: flex; flex-direction: row; gap: 12px; align-items: center;">
      <input type="checkbox" id="antiPasteBypass">
      <label for="antiPasteBypass" style="font-weight: normal; cursor: pointer;">
        Anti-paste bypass: emit realistic keyboard events (disable to insert text without key events)
      </label>
    </div>

    <div class="form-group" style="margin-top: 14px;">
      <label>Keyboard Sound Feedback</label>
      <select id="soundFeedback">
        <option value="silent">Silent</option>
        <option value="cherry-blue">Cherry Blue (clicky)</option>
        <option value="cherry-brown">Cherry Brown (tactile)</option>
        <option value="cherry-red">Cherry Red (linear)</option>
      </select>
    </div>

    <div class="form-group">
      <label>Sound Volume: <span id="soundVolume-display" class="badge-val">30%</span></label>
      <div class="slider-row">
        <input type="range" id="soundVolume" min="0" max="100" value="30">
      </div>
    </div>
  </div>

  <!-- EDIT / CREATE SNIPPET MODAL -->
  <div id="snip-modal" class="modal-backdrop">
    <div class="modal-content">
      <h3 id="modal-title" style="font-size: 18px; margin-bottom: 12px;">Add New Snippet</h3>
      <form id="modal-form" style="display: flex; flex-direction: column; gap: 12px;">
        <div class="form-group">
          <label>Snippet Name / Title *</label>
          <input type="text" id="m-title" required placeholder="e.g. Sales Intro Template" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label>Tags (comma-separated)</label>
            <input type="text" id="m-tags" placeholder="email, work, proposal" />
          </div>
          <div class="form-group">
            <label>Shortcut Trigger (e.g. :intro)</label>
            <input type="text" id="m-trigger" placeholder=":intro" />
          </div>
        </div>

        <div class="form-group">
          <label>Custom Keyboard Shortcut</label>
          <button type="button" id="m-sc-record" class="recorder-btn">
            <span id="m-sc-val">None (Click to record combo)</span>
            <span class="hint">Optional</span>
          </button>
        </div>

        <div class="form-group">
          <label>Snippet Content *</label>
          <textarea id="m-content" rows="6" required placeholder="Text to type character-by-character..."></textarea>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
          <button type="button" id="m-cancel" class="btn-secondary">Cancel</button>
          <button type="submit" class="btn-primary">Save Snippet</button>
        </div>
      </form>
    </div>
  </div>

  <script src="options.js"></script>
</body>
</html>
`;

  // 8. options.js
  const optionsJs = `/**
 * AutoTyper Pro - Options Page Controller
 * Manages custom keyboard shortcuts & snippet CRUD
 */
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const data = await browserAPI.storage.local.get(['settings', 'snippets']);
  let settings = data.settings || {};
  let snippets = data.snippets || [];

  if (!settings.shortcuts) {
    settings.shortcuts = {
      autoTypeClipboard: 'Alt+Shift+V',
      openSnippetPicker: 'Alt+K',
      openSnippetManager: 'Alt+Shift+O',
      stopTyping: 'Escape',
      triggerMistake: 'Alt+M',
      pauseTyping: 'Alt+P'
    };
  } else {
    if (!settings.shortcuts.triggerMistake) {
      settings.shortcuts.triggerMistake = 'Alt+M';
    }
    if (!settings.shortcuts.pauseTyping) {
      settings.shortcuts.pauseTyping = 'Alt+P';
    }
  }

  // --- SHORTCUT RECORDERS ---
  function setupShortcutRecorder(btnId, settingsKey) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.querySelector('.sc-val').textContent = settings.shortcuts[settingsKey] || 'None';

    btn.onclick = () => {
      btn.classList.add('listening');
      btn.querySelector('.sc-val').textContent = 'Press key combination (Backspace to clear)...';

      const onKeyDown = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Escape') {
          btn.classList.remove('listening');
          btn.querySelector('.sc-val').textContent = settings.shortcuts[settingsKey] || 'None';
          window.removeEventListener('keydown', onKeyDown, true);
          return;
        }

        if (e.key === 'Backspace' || e.key === 'Delete') {
          settings.shortcuts[settingsKey] = '';
          await browserAPI.storage.local.set({ settings });
          btn.classList.remove('listening');
          btn.querySelector('.sc-val').textContent = 'None';
          window.removeEventListener('keydown', onKeyDown, true);
          return;
        }

        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

        const hasModifier = e.ctrlKey || e.altKey || e.metaKey;
        const isFunctionKey = /^F([1-9]|1[0-2])$/.test(e.key);
        const isSpecialKey = e.key === 'Tab' || e.key === 'Enter';
        if (!hasModifier && !isFunctionKey && !isSpecialKey) {
          btn.querySelector('.sc-val').textContent = 'Add Ctrl / Alt / Meta (or use an F-key)';
          return;
        }

        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        if (e.metaKey) parts.push('Meta');

        let key = e.key;
        if (key === ' ') key = 'Space';
        else if (key.length === 1) key = key.toUpperCase();
        parts.push(key);

        const combo = parts.join('+');
        settings.shortcuts[settingsKey] = combo;
        await browserAPI.storage.local.set({ settings });

        btn.classList.remove('listening');
        btn.querySelector('.sc-val').textContent = combo;
        window.removeEventListener('keydown', onKeyDown, true);
      };

      window.addEventListener('keydown', onKeyDown, true);
    };
  }

  setupShortcutRecorder('sc-clipboard', 'autoTypeClipboard');
  setupShortcutRecorder('sc-picker', 'openSnippetPicker');
  setupShortcutRecorder('sc-manager', 'openSnippetManager');
  setupShortcutRecorder('sc-stop', 'stopTyping');
  setupShortcutRecorder('sc-mistake', 'triggerMistake');
  setupShortcutRecorder('sc-pause', 'pauseTyping');

  // --- SPEED, SOUND & MISTAKE CONTROLS ---
  const wpmInput = document.getElementById('targetWpm');
  const wpmDisplay = document.getElementById('wpm-display');
  const jitterInput = document.getElementById('jitterPercent');
  const jitterDisplay = document.getElementById('jitter-display');
  const autoTypeOnPaste = document.getElementById('autoTypeOnPaste');
  const antiPasteBypass = document.getElementById('antiPasteBypass');
  const speedModeSelect = document.getElementById('speedMode');
  const baseDelayInput = document.getElementById('baseDelayMs');
  const baseDelayDisplay = document.getElementById('baseDelay-display');
  const soundSelect = document.getElementById('soundFeedback');
  const soundVolumeInput = document.getElementById('soundVolume');
  const soundVolumeDisplay = document.getElementById('soundVolume-display');

  const saveSettings = () => browserAPI.storage.local.set({ settings });

  const mistakeRadios = document.querySelectorAll('input[name="mistakeMode"]');
  const curMistakeMode = settings.mistakeMode || 'manual';
  mistakeRadios.forEach(radio => {
    if (radio.value === curMistakeMode) radio.checked = true;
    radio.onchange = async () => {
      settings.mistakeMode = radio.value;
      settings.typoSimulation = radio.value === 'automatic';
      await saveSettings();
    };
  });

  if (wpmInput) {
    if (settings.targetWpm) wpmInput.value = settings.targetWpm;
    if (wpmDisplay) wpmDisplay.textContent = wpmInput.value + ' WPM';
    wpmInput.oninput = async () => {
      if (wpmDisplay) wpmDisplay.textContent = wpmInput.value + ' WPM';
      settings.targetWpm = parseInt(wpmInput.value, 10);
      await saveSettings();
    };
  }

  if (jitterInput) {
    if (settings.jitterPercent !== undefined) jitterInput.value = settings.jitterPercent;
    if (jitterDisplay) jitterDisplay.textContent = jitterInput.value + '%';
    jitterInput.oninput = async () => {
      if (jitterDisplay) jitterDisplay.textContent = jitterInput.value + '%';
      settings.jitterPercent = parseInt(jitterInput.value, 10);
      await saveSettings();
    };
  }

  if (speedModeSelect) {
    speedModeSelect.value = settings.speedMode || 'human';
    speedModeSelect.onchange = async () => {
      settings.speedMode = speedModeSelect.value;
      await saveSettings();
    };
  }

  if (baseDelayInput) {
    baseDelayInput.value = settings.baseDelayMs || 45;
    if (baseDelayDisplay) baseDelayDisplay.textContent = baseDelayInput.value + ' ms';
    baseDelayInput.oninput = async () => {
      if (baseDelayDisplay) baseDelayDisplay.textContent = baseDelayInput.value + ' ms';
      settings.baseDelayMs = parseInt(baseDelayInput.value, 10);
      await saveSettings();
    };
  }

  if (autoTypeOnPaste) {
    autoTypeOnPaste.checked = !!settings.autoTypeOnPaste;
    autoTypeOnPaste.onchange = async () => {
      settings.autoTypeOnPaste = autoTypeOnPaste.checked;
      await saveSettings();
    };
  }

  if (antiPasteBypass) {
    antiPasteBypass.checked = settings.antiPasteBypass !== false;
    antiPasteBypass.onchange = async () => {
      settings.antiPasteBypass = antiPasteBypass.checked;
      await saveSettings();
    };
  }

  if (soundSelect) {
    soundSelect.value = settings.soundFeedback || 'silent';
    soundSelect.onchange = async () => {
      settings.soundFeedback = soundSelect.value;
      await saveSettings();
    };
  }

  if (soundVolumeInput) {
    soundVolumeInput.value = Math.round((settings.soundVolume ?? 0.3) * 100);
    if (soundVolumeDisplay) soundVolumeDisplay.textContent = soundVolumeInput.value + '%';
    soundVolumeInput.oninput = async () => {
      if (soundVolumeDisplay) soundVolumeDisplay.textContent = soundVolumeInput.value + '%';
      settings.soundVolume = parseInt(soundVolumeInput.value, 10) / 100;
      await saveSettings();
    };
  }

  // --- SNIPPET MANAGEMENT ---
  const searchInput = document.getElementById('search-snips');
  const tagFiltersEl = document.getElementById('tag-filters');
  const tbody = document.getElementById('snippets-rows');
  const addBtn = document.getElementById('btn-add-snip');
  const exportBtn = document.getElementById('btn-export-json');

  const modal = document.getElementById('snip-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalForm = document.getElementById('modal-form');
  const mTitle = document.getElementById('m-title');
  const mTags = document.getElementById('m-tags');
  const mTrigger = document.getElementById('m-trigger');
  const mContent = document.getElementById('m-content');
  const mScBtn = document.getElementById('m-sc-record');
  const mScVal = document.getElementById('m-sc-val');
  const mCancel = document.getElementById('m-cancel');

  let editingSnippetId = null;
  let recordedShortcut = undefined;
  let activeTagFilter = 'all';

  function renderTagFilters() {
    const allTags = new Set();
    snippets.forEach(s => {
      if (s.tags) s.tags.forEach(t => allTags.add(t));
    });

    tagFiltersEl.innerHTML = '';
    const allBtn = document.createElement('span');
    allBtn.className = 'tag-chip' + (activeTagFilter === 'all' ? ' active' : '');
    allBtn.textContent = 'All Tags';
    allBtn.onclick = () => { activeTagFilter = 'all'; renderTable(); renderTagFilters(); };
    tagFiltersEl.appendChild(allBtn);

    Array.from(allTags).sort().forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip' + (activeTagFilter === tag ? ' active' : '');
      chip.textContent = '#' + tag;
      chip.onclick = () => { activeTagFilter = tag; renderTable(); renderTagFilters(); };
      tagFiltersEl.appendChild(chip);
    });
  }

  function renderTable() {
    tbody.innerHTML = '';
    const q = searchInput.value.toLowerCase();

    const filtered = snippets.filter(s => {
      const matchesTag = activeTagFilter === 'all' || (s.tags && s.tags.includes(activeTagFilter));
      const matchesSearch = !q ||
        s.title.toLowerCase().includes(q) ||
        (s.tags && s.tags.some(t => t.toLowerCase().includes(q))) ||
        (s.shortcutTrigger && s.shortcutTrigger.toLowerCase().includes(q)) ||
        s.content.toLowerCase().includes(q);
      return matchesTag && matchesSearch;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b; padding:24px;">No snippets match search</td></tr>';
      return;
    }

    filtered.forEach((item) => {
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td><strong>\${item.title}</strong></td>
        <td><span style="color:#94a3b8; font-size:11px;">\${item.tags ? item.tags.map(t => '#' + t).join(' ') : '-'}</span></td>
        <td>\${item.shortcutTrigger ? '<span class="badge">' + item.shortcutTrigger + '</span>' : '-'}</td>
        <td>\${item.keyboardShortcut ? '<span class="badge" style="background:#1e1b4b; color:#a5b4fc; border-color:#4338ca;">' + item.keyboardShortcut + '</span>' : '-'}</td>
        <td>
          <button data-id="\${item.id}" class="edit-btn btn-secondary" style="margin-right:6px;">Edit</button>
          <button data-id="\${item.id}" class="del-btn btn-danger">Delete</button>
        </td>
      \`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = () => openModal(btn.dataset.id);
    });

    tbody.querySelectorAll('.del-btn').forEach(btn => {
      btn.onclick = async () => {
        if (confirm('Delete this snippet?')) {
          snippets = snippets.filter(s => s.id !== btn.dataset.id);
          await browserAPI.storage.local.set({ snippets });
          renderTable();
          renderTagFilters();
        }
      };
    });
  }

  function openModal(snippetId = null) {
    editingSnippetId = snippetId;
    if (snippetId) {
      const found = snippets.find(s => s.id === snippetId);
      if (!found) return;
      modalTitle.textContent = 'Edit Snippet';
      mTitle.value = found.title;
      mTags.value = found.tags ? found.tags.join(', ') : '';
      mTrigger.value = found.shortcutTrigger || '';
      mContent.value = found.content;
      recordedShortcut = found.keyboardShortcut;
      mScVal.textContent = found.keyboardShortcut || 'None (Click to record combo)';
    } else {
      modalTitle.textContent = 'Add New Snippet';
      mTitle.value = '';
      mTags.value = '';
      mTrigger.value = ':';
      mContent.value = '';
      recordedShortcut = undefined;
      mScVal.textContent = 'None (Click to record combo)';
    }
    modal.style.display = 'flex';
  }

  mScBtn.onclick = () => {
    mScBtn.classList.add('listening');
    mScVal.textContent = 'Press keys (e.g. Alt+1) or Backspace to clear...';

    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        mScBtn.classList.remove('listening');
        mScVal.textContent = recordedShortcut || 'None (Click to record combo)';
        window.removeEventListener('keydown', onKey, true);
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        recordedShortcut = undefined;
        mScVal.textContent = 'None (Click to record combo)';
        mScBtn.classList.remove('listening');
        window.removeEventListener('keydown', onKey, true);
        return;
      }
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

      const hasModifier = e.ctrlKey || e.altKey || e.metaKey;
      const isFunctionKey = /^F([1-9]|1[0-2])$/.test(e.key);
      const isSpecialKey = e.key === 'Tab' || e.key === 'Enter';
      if (!hasModifier && !isFunctionKey && !isSpecialKey) {
        mScVal.textContent = 'Add Ctrl / Alt / Meta (or use an F-key)';
        return;
      }

      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Meta');

      let key = e.key;
      if (key === ' ') key = 'Space';
      else if (key.length === 1) key = key.toUpperCase();
      parts.push(key);

      recordedShortcut = parts.join('+');
      mScVal.textContent = recordedShortcut;
      mScBtn.classList.remove('listening');
      window.removeEventListener('keydown', onKey, true);
    };

    window.addEventListener('keydown', onKey, true);
  };

  mCancel.onclick = () => { modal.style.display = 'none'; };

  modalForm.onsubmit = async (e) => {
    e.preventDefault();
    const title = mTitle.value.trim();
    const content = mContent.value;
    const tags = mTags.value.split(',').map(t => t.trim()).filter(Boolean);
    const trigger = mTrigger.value.trim() || undefined;

    if (!title || !content) return;

    if (editingSnippetId) {
      snippets = snippets.map(s => s.id === editingSnippetId ? {
        ...s,
        title,
        content,
        tags,
        shortcutTrigger: trigger,
        keyboardShortcut: recordedShortcut
      } : s);
    } else {
      snippets.unshift({
        id: 'snip_' + Date.now().toString(36),
        title,
        content,
        category: 'custom',
        tags,
        shortcutTrigger: trigger,
        keyboardShortcut: recordedShortcut,
        createdAt: Date.now(),
        useCount: 0
      });
    }

    await browserAPI.storage.local.set({ snippets });
    modal.style.display = 'none';
    renderTable();
    renderTagFilters();
  };

  addBtn.onclick = () => openModal(null);
  searchInput.oninput = () => renderTable();

  exportBtn.onclick = () => {
    const blob = new Blob([JSON.stringify(snippets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'autotyper-snippets.json';
    a.click();
  };

  renderTable();
  renderTagFilters();
});
`;

  // 9. icon.svg
  const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="keycap" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#818cf8"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#bg)"/>
  <rect x="24" y="24" width="80" height="80" rx="16" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <rect x="32" y="32" width="64" height="64" rx="12" fill="url(#keycap)"/>
  <path d="M52 46h24M64 46v36M56 82h16" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M82 40l-8 14h10l-12 18 4-12h-8z" fill="url(#glow)"/>
</svg>`;

  // 10. README.md
  const readmeMd = `# AutoTyper Pro - Cross-Browser Extension

Auto-types pasted text and selected snippets into any field with realistic keystrokes, typo correction, anti-paste bypass, and custom keyboard shortcuts.

## Features
- **Custom Keyboard Shortcuts**:
  - Global activation shortcut to auto-type clipboard (default \`Alt+Shift+V\`).
  - In-Page Quick Snippet Command Palette (default \`Alt+K\`).
  - Snippet Manager shortcut (default \`Alt+Shift+O\`).
  - Per-snippet keybindings (assign combinations like \`Alt+1\`, \`Ctrl+Alt+S\` to specific snippets).
- **Snippet Management System**:
  - Add, edit, delete snippets with custom names and multiple tags (\`#email\`, \`#code\`, etc.).
  - Search and filter snippets by name, tag, or shortcut trigger.
  - Export and import your snippet database in standard JSON format.
- **Human-Realistic Typing**: Realistic Words-Per-Minute pacing with natural jitter, variance, and punctuation delays.
- **Anti-Paste Bypass**: Dispatches authentic \`keydown\`, \`keypress\`, \`beforeinput\`, and \`input\` events so you can type into locked forms, banking forms, or proctored exam fields that disable pasting.
- **Typo Correction**: Simulates realistic accidental keypresses with instant backspace deletion.
- **Snippet Hotkeys & Triggers**: Expand snippets by typing prefixes like \`:sig\` or \`:email\` followed by Tab.

## How to Install in Google Chrome, Brave, Microsoft Edge, or Opera
1. Unzip the downloaded \`autotyper-pro-extension.zip\` into a folder on your computer.
2. In your browser, open the Extensions page:
   - Chrome / Brave: navigate to \`chrome://extensions\`
   - Edge: navigate to \`edge://extensions\`
   - Opera: navigate to \`opera://extensions\`
3. Turn ON **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"**.
5. Select the unzipped folder containing \`manifest.json\`.
6. Done! The AutoTyper Pro icon will appear in your browser toolbar.

## How to Install in Mozilla Firefox
1. Unzip the archive into a folder.
2. In Firefox, open \`about:debugging#/runtime/this-firefox\`.
3. Under **Temporary Extensions**, click **"Load Temporary Add-on..."**.
4. Select the \`manifest.json\` file inside the unzipped folder.
5. The extension is now loaded and ready!
`;

  const files: GeneratedExtensionFile[] = [
    {
      name: 'manifest.json',
      path: 'manifest.json',
      language: 'json',
      content: JSON.stringify(manifest, null, 2),
      description: isFirefox ? 'Firefox Manifest V3 configuration' : 'Chromium Manifest V3 configuration with offscreen clipboard support',
    },
    {
      name: 'background.js',
      path: 'background.js',
      language: 'javascript',
      content: backgroundJs,
      description: 'Background worker/page for clipboard access, context menus, and command routing',
    },
    {
      name: 'content.js',
      path: 'content.js',
      language: 'javascript',
      content: contentJs,
      description: 'In-page script that executes custom shortcuts, in-page command palette, and simulated typing',
    },
    {
      name: 'content.css',
      path: 'content.css',
      language: 'css',
      content: contentCss,
      description: 'Styles for the in-page command palette overlay and floating status pill',
    },
    {
      name: 'popup.html',
      path: 'popup.html',
      language: 'html',
      content: popupHtml,
      description: 'Browser action popup UI layout with snippet tags and shortcut labels',
    },
    {
      name: 'popup.js',
      path: 'popup.js',
      language: 'javascript',
      content: popupJs,
      description: 'Popup interactive controller logic',
    },
    {
      name: 'options.html',
      path: 'options.html',
      language: 'html',
      content: optionsHtml,
      description: 'Full snippet management system & custom keyboard shortcuts configuration page',
    },
    {
      name: 'options.js',
      path: 'options.js',
      language: 'javascript',
      content: optionsJs,
      description: 'Options page controller with interactive shortcut recorder and snippet CRUD',
    },
    ...ICON_SIZES.map((size) => ({
      name: `icon${size}.png`,
      path: `icons/icon${size}.png`,
      language: 'png' as const,
      content: ICON_PNG_BASE64[size],
      encoding: 'base64' as const,
      description: `${size}x${size} PNG toolbar/store icon`,
    })),
    {
      name: 'icon.svg',
      path: 'icons/icon.svg',
      language: 'xml',
      content: iconSvg,
      description: 'Scalable vector source icon for store badges and documentation',
    },
    {
      name: 'README.md',
      path: 'README.md',
      language: 'markdown',
      content: readmeMd,
      description: 'Detailed instructions for loading unpacked extension in Chrome and Firefox',
    },
  ];

  if (!isFirefox) {
    files.push(
      {
        name: 'offscreen.html',
        path: 'offscreen.html',
        language: 'html',
        content: offscreenHtml,
        description: 'Hidden offscreen document used for clipboard access in Manifest V3',
      },
      {
        name: 'offscreen.js',
        path: 'offscreen.js',
        language: 'javascript',
        content: offscreenJs,
        description: 'Offscreen clipboard bridge for the Chromium service worker',
      }
    );
  }

  return files;
}

export async function createExtensionZip(
  snippets: Snippet[],
  settings: AutoTyperSettings,
  targetBrowser: TargetBrowser = 'chrome'
): Promise<Blob> {
  const zip = new JSZip();
  const files = generateExtensionFiles(snippets, settings, targetBrowser);

  for (const file of files) {
    if (file.encoding === 'base64') {
      zip.file(file.path, file.content, { base64: true });
    } else {
      zip.file(file.path, file.content);
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}
