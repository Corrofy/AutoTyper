/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AutoTyperSettings, TypingProgressState } from '../types/extension.ts';
import { keyboardSound } from './keyboardSound.ts';

// Common adjacent keys on QWERTY keyboard for realistic typo generation
const QWERTY_ADJACENT: Record<string, string[]> = {
  a: ['q', 'w', 's', 'z'],
  b: ['v', 'g', 'h', 'n'],
  c: ['x', 'd', 'f', 'v'],
  d: ['s', 'e', 'r', 'f', 'c', 'x'],
  e: ['w', 's', 'd', 'r', '3', '4'],
  f: ['d', 'r', 't', 'g', 'v', 'c'],
  g: ['f', 't', 'y', 'h', 'b', 'v'],
  h: ['g', 'y', 'u', 'j', 'n', 'b'],
  i: ['u', 'j', 'k', 'o', '8', '9'],
  j: ['h', 'u', 'i', 'k', 'm', 'n'],
  k: ['j', 'i', 'o', 'l', 'm'],
  l: ['k', 'o', 'p', ';'],
  m: ['n', 'j', 'k'],
  n: ['b', 'h', 'j', 'm'],
  o: ['i', 'k', 'l', 'p', '9', '0'],
  p: ['o', 'l', '[', '-', '0'],
  q: ['1', '2', 'w', 'a'],
  r: ['e', '4', '5', 't', 'f', 'd'],
  s: ['a', 'w', 'e', 'd', 'x', 'z'],
  t: ['r', '5', '6', 'y', 'g', 'f'],
  u: ['y', '7', '8', 'i', 'j', 'h'],
  v: ['c', 'f', 'g', 'b'],
  w: ['q', '2', '3', 'e', 's', 'a'],
  x: ['z', 's', 'd', 'c'],
  y: ['t', '6', '7', 'u', 'h', 'g'],
  z: ['a', 's', 'x'],
};

export function interpolateSnippetVariables(text: string): string {
  const now = new Date();
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return text
    .replace(/\{\{date\}\}/gi, now.toLocaleDateString())
    .replace(/\{\{time\}\}/gi, now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    .replace(/\{\{weekday\}\}/gi, weekdays[now.getDay()])
    .replace(/\{\{month\}\}/gi, months[now.getMonth()])
    .replace(/\{\{year\}\}/gi, now.getFullYear().toString())
    .replace(/\{\{timestamp\}\}/gi, now.toISOString())
    .replace(/\{\{name\}\}/gi, 'Jordan Taylor')
    .replace(/\{\{email\}\}/gi, 'jordan.taylor@example.com')
    .replace(/\{\{ticket_id\}\}/gi, Math.floor(100000 + Math.random() * 900000).toString());
}

export function calculateCharacterDelay(settings: AutoTyperSettings, char: string): number {
  let baseDelay: number;

  if (settings.speedMode === 'human') {
    // 1 word = 5 characters. Delay = 60,000 / (WPM * 5)
    baseDelay = 60000 / (Math.max(10, settings.targetWpm) * 5);
  } else if (settings.speedMode === 'steady') {
    baseDelay = settings.baseDelayMs;
  } else if (settings.speedMode === 'turbo') {
    baseDelay = 12; // Ultra fast
  } else {
    baseDelay = settings.baseDelayMs;
  }

  // Add human variance / jitter
  if (settings.jitterPercent > 0 && settings.speedMode !== 'turbo') {
    const varianceFactor = (settings.jitterPercent / 100) * 0.8;
    const randomShift = (Math.random() * 2 - 1) * varianceFactor;
    baseDelay = Math.max(15, baseDelay * (1 + randomShift));
  }

  // Punctuation and newline pauses
  if (['.', '!', '?', ';', '\n'].includes(char)) {
    baseDelay += settings.punctuationPauseMs;
  } else if ([',', ':', '-'].includes(char)) {
    baseDelay += settings.punctuationPauseMs * 0.6;
  } else if (char === ' ') {
    // Slight pause between words
    baseDelay += baseDelay * 0.35;
  }

  return Math.round(baseDelay);
}

export function getTypoCharacter(char: string): string | null {
  const lower = char.toLowerCase();
  const list = QWERTY_ADJACENT[lower];
  if (!list || list.length === 0) return null;
  const picked = list[Math.floor(Math.random() * list.length)];
  return char === char.toUpperCase() ? picked.toUpperCase() : picked;
}

export interface KeystrokeSpec {
  key: string;
  code: string;
  keyCode: number;
  shiftKey: boolean;
  charCode: number;
}

export function getKeystrokeSpec(char: string): KeystrokeSpec {
  if (char === '\n') {
    return { key: 'Enter', code: 'Enter', keyCode: 13, shiftKey: false, charCode: 13 };
  }
  if (char === ' ') {
    return { key: ' ', code: 'Space', keyCode: 32, shiftKey: false, charCode: 32 };
  }
  if (char === '\t') {
    return { key: 'Tab', code: 'Tab', keyCode: 9, shiftKey: false, charCode: 9 };
  }

  // Letters: keyCode for keydown/keyup is strictly 65-90 (uppercase ASCII)
  // NEVER use lowercase charCodeAt (97-122) as it collides with F1-F12 and NumPad keys!
  if (/^[a-zA-Z]$/.test(char)) {
    const isUpper = char === char.toUpperCase();
    return {
      key: char,
      code: `Key${char.toUpperCase()}`,
      keyCode: char.toUpperCase().charCodeAt(0),
      shiftKey: isUpper,
      charCode: char.charCodeAt(0),
    };
  }

  // Digits: 48-57
  if (/^[0-9]$/.test(char)) {
    return {
      key: char,
      code: `Digit${char}`,
      keyCode: char.charCodeAt(0),
      shiftKey: false,
      charCode: char.charCodeAt(0),
    };
  }

  // Symbol mapping: Prevents '.' (46) colliding with Delete key, '!' (33) with PageUp, etc.
  const symbolMap: Record<string, { keyCode: number; code: string; shiftKey: boolean }> = {
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
    '\\': { keyCode: 220, code: 'Backslash', shiftKey: false },
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
    '`': { keyCode: 192, code: 'Backquote', shiftKey: false },
    '~': { keyCode: 192, code: 'Backquote', shiftKey: true },
  };

  const mapped = symbolMap[char];
  if (mapped) {
    return {
      key: char,
      code: mapped.code,
      keyCode: mapped.keyCode,
      shiftKey: mapped.shiftKey,
      charCode: char.charCodeAt(0),
    };
  }

  return {
    key: char,
    code: '',
    keyCode: 0,
    shiftKey: false,
    charCode: char.charCodeAt(0),
  };
}

/**
 * Detect the leading whitespace indentation of the active line in an element.
 * Works with HTMLInputElement, HTMLTextAreaElement, Monaco Editor, CodeMirror 5/6, and ContentEditable.
 */
export function getActiveLineLeadingIndent(el: HTMLElement | null): string {
  if (!el) return '';

  // 1. Standard Input or Textarea
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const pos = el.selectionStart ?? el.value.length;
    const textBefore = el.value.slice(0, pos);
    const lastLine = textBefore.split('\n').pop() || '';
    const match = lastLine.match(/^[ \t]*/);
    return match ? match[0] : '';
  }

  // 2. Monaco Editor (.monaco-editor)
  const monacoContainer = el.closest ? (el.closest('.monaco-editor') as HTMLElement | null) : null;
  if (monacoContainer) {
    try {
      // Method A: Check window.monaco if available in execution context
      const win = window as any;
      if (win.monaco?.editor) {
        const editors = win.monaco.editor.getEditors();
        for (const ed of editors) {
          const dom = ed.getDomNode();
          if (dom && (dom === monacoContainer || dom.contains(monacoContainer) || monacoContainer.contains(dom))) {
            const pos = ed.getPosition();
            if (pos) {
              const line = ed.getModel().getLineContent(pos.lineNumber);
              const leading = line.slice(0, pos.column - 1);
              const match = leading.match(/^[ \t]*/);
              return match ? match[0] : '';
            }
          }
        }
      }

      // Method B: DOM Inspection via .cursors-layer and .view-line
      const cursor = monacoContainer.querySelector('.cursors-layer .cursor') as HTMLElement | null;
      const cursorTop = cursor ? cursor.style.top : null;
      const viewLines = monacoContainer.querySelectorAll('.view-lines .view-line');
      for (let i = 0; i < viewLines.length; i++) {
        const vl = viewLines[i] as HTMLElement;
        if (!cursorTop || vl.style.top === cursorTop) {
          const text = (vl.textContent || '').replace(/\u00a0/g, ' ');
          const match = text.match(/^[ \t]*/);
          return match ? match[0] : '';
        }
      }
    } catch {}
  }

  // 3. CodeMirror 6 (.cm-editor / .cm-content)
  const cmEditor = el.closest ? (el.closest('.cm-editor') as HTMLElement | null) : null;
  if (cmEditor) {
    try {
      const activeLine = cmEditor.querySelector('.cm-activeLine');
      if (activeLine) {
        const text = (activeLine.textContent || '').replace(/\u00a0/g, ' ');
        const match = text.match(/^[ \t]*/);
        return match ? match[0] : '';
      }
    } catch {}
  }

  // 4. CodeMirror 5 (.CodeMirror)
  const cm5 = el.closest ? (el.closest('.CodeMirror') as HTMLElement | null) : null;
  if (cm5) {
    try {
      const lines = cm5.querySelectorAll('.CodeMirror-line');
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        const text = (lastLine.textContent || '').replace(/\u00a0/g, ' ');
        const match = text.match(/^[ \t]*/);
        return match ? match[0] : '';
      }
    } catch {}
  }

  // 5. ContentEditable elements
  if (el.isContentEditable) {
    try {
      const sel = window.getSelection();
      if (sel && sel.anchorNode) {
        let node: Node | null = sel.anchorNode;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          const offset = sel.anchorOffset;
          const before = text.slice(0, offset);
          const match = before.match(/(?:^|\n)([ \t]*)$/);
          return match ? match[1] : '';
        }
      }
    } catch {}
  }

  return '';
}

/**
 * Check if the character immediately following the cursor matches the given char
 * (used to step over auto-closed brackets/quotes: ), }, ], ", ')
 */
export function isNextCharInEditor(el: HTMLElement | null, char: string): boolean {
  if (!el) return false;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const pos = el.selectionStart;
    if (pos !== null && pos < el.value.length) {
      return el.value[pos] === char;
    }
    return false;
  }

  const monacoContainer = el.closest ? (el.closest('.monaco-editor') as HTMLElement | null) : null;
  if (monacoContainer) {
    try {
      const win = window as any;
      if (win.monaco?.editor) {
        const editors = win.monaco.editor.getEditors();
        for (const ed of editors) {
          const pos = ed.getPosition();
          if (pos) {
            const line = ed.getModel().getLineContent(pos.lineNumber);
            return line[pos.column - 1] === char;
          }
        }
      }
    } catch {}
  }

  return false;
}

/**
 * Step over a character after the cursor (e.g. auto-closed bracket)
 */
export function stepOverChar(el: HTMLElement) {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? 0;
    el.selectionStart = el.selectionEnd = start + 1;
    return;
  }

  const arrowEvent = new KeyboardEvent('keydown', {
    key: 'ArrowRight',
    code: 'ArrowRight',
    keyCode: 39,
    which: 39,
    bubbles: true,
    cancelable: true,
    composed: true,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
  });
  el.dispatchEvent(arrowEvent);
  el.dispatchEvent(new KeyboardEvent('keyup', {
    key: 'ArrowRight',
    code: 'ArrowRight',
    keyCode: 39,
    which: 39,
    bubbles: true,
    cancelable: true,
    composed: true,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
  }));
}

export interface AutoTypeOptions {
  snippetTitle: string;
  text: string;
  targetElement: HTMLElement | HTMLInputElement | HTMLTextAreaElement | null;
  settings: AutoTyperSettings;
  onProgress?: (progress: TypingProgressState) => void;
  onComplete?: () => void;
  onCancel?: () => void;
}

export class AutoTyperSession {
  private isCancelled = false;
  private isPaused = false;
  private pausedDueToFocusLoss = false;
  private resolvePause: (() => void) | null = null;
  private options: AutoTypeOptions;
  private startTime = 0;
  private totalPausedMs = 0;
  private pauseStartTime = 0;
  private typosCorrected = 0;
  private manualMistakeRequested = false;
  private lastProgressState: TypingProgressState | null = null;
  private onVisibilityChange: (() => void) | null = null;
  private onWindowBlur: (() => void) | null = null;
  private onWindowFocus: (() => void) | null = null;

  constructor(options: AutoTypeOptions) {
    this.options = options;
  }

  /**
   * Manually trigger a typo/mistake immediately on the next character
   */
  public triggerManualMistake() {
    if (this.options.settings.mistakeMode === 'disabled') return;
    this.manualMistakeRequested = true;
  }

  private cleanupListeners() {
    if (this.onVisibilityChange) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.onVisibilityChange = null;
    }
    if (this.onWindowBlur) {
      window.removeEventListener('blur', this.onWindowBlur);
      this.onWindowBlur = null;
    }
    if (this.onWindowFocus) {
      window.removeEventListener('focus', this.onWindowFocus);
      this.onWindowFocus = null;
    }
  }

  public cancel() {
    this.isCancelled = true;
    this.cleanupListeners();
    if (this.resolvePause) {
      this.resolvePause();
      this.resolvePause = null;
    }
    this.options.onCancel?.();
  }

  public pause() {
    if (!this.isPaused) {
      this.isPaused = true;
      this.pauseStartTime = Date.now();
      if (this.lastProgressState) {
        this.options.onProgress?.({
          ...this.lastProgressState,
          isPaused: true,
        });
      }
    }
  }

  public resume() {
    if (this.isPaused) {
      this.isPaused = false;
      if (this.pauseStartTime > 0) {
        this.totalPausedMs += Date.now() - this.pauseStartTime;
        this.pauseStartTime = 0;
      }
      if (this.resolvePause) {
        this.resolvePause();
        this.resolvePause = null;
      }
      if (this.lastProgressState) {
        this.options.onProgress?.({
          ...this.lastProgressState,
          isPaused: false,
        });
      }
    }
  }

  public togglePause(): boolean {
    if (this.isPaused) {
      this.resume();
      return false;
    } else {
      this.pause();
      return true;
    }
  }

  public setTargetWpm(wpm: number) {
    this.options.settings.targetWpm = Math.max(15, Math.min(300, wpm));
    if (this.options.settings.speedMode === 'turbo') {
      this.options.settings.speedMode = 'human';
    }
  }

  public setSpeedMode(mode: 'human' | 'steady' | 'turbo' | 'custom') {
    this.options.settings.speedMode = mode;
  }

  public getTargetWpm(): number {
    return this.options.settings.targetWpm;
  }

  public getSpeedMode(): string {
    return this.options.settings.speedMode;
  }

  private async wait(ms: number): Promise<void> {
    if (this.isCancelled) return;
    await new Promise((r) => setTimeout(r, ms));
    while (this.isPaused && !this.isCancelled) {
      await new Promise<void>((resolve) => {
        this.resolvePause = resolve;
      });
    }
  }

  private dispatchKeyboardEvent(el: HTMLElement, type: 'keydown' | 'keypress' | 'keyup', char: string) {
    const spec = getKeystrokeSpec(char);

    // CRITICAL: Explicitly ensure ctrlKey, altKey, metaKey are strictly false
    // Monaco / CodeMirror will otherwise detect spurious modifiers or default keys and open search or palettes
    const event = new KeyboardEvent(type, {
      key: spec.key,
      code: spec.code,
      keyCode: spec.keyCode,
      which: spec.keyCode,
      charCode: type === 'keypress' ? spec.charCode : 0,
      bubbles: true,
      cancelable: true,
      composed: true,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: spec.shiftKey,
    });

    el.dispatchEvent(event);
  }

  private focusElement(el: HTMLElement) {
    try {
      el.focus({ preventScroll: true });
    } catch {
      try {
        el.focus();
      } catch {}
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

  private insertCharacterIntoElement(el: HTMLElement, char: string) {
    const isEnter = char === '\n';
    const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

    // Simulate native beforeinput
    try {
      const beforeInput = new InputEvent('beforeinput', {
        data: isEnter ? null : char,
        inputType: isEnter ? 'insertLineBreak' : 'insertText',
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      el.dispatchEvent(beforeInput);
    } catch {
      // Fallback
    }

    // Attempt document.execCommand('insertText') which Monaco & CodeMirror natively catch
    let inserted = false;
    try {
      inserted = document.execCommand('insertText', false, isEnter ? '\n' : char);
    } catch {
      inserted = false;
    }

    if (!inserted) {
      if (isInput) {
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const val = input.value;
        input.value = val.slice(0, start) + char + val.slice(end);
        input.selectionStart = input.selectionEnd = start + char.length;
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      } else if (el.isContentEditable) {
        this.focusElement(el);
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          const node = isEnter ? document.createElement('br') : document.createTextNode(char);
          range.insertNode(node);
          range.setStartAfter(node);
          range.setEndAfter(node);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          el.innerText += char;
        }
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
    }
  }

  private backspaceElement(el: HTMLElement) {
    let deleted = false;
    try {
      deleted = document.execCommand('delete', false);
    } catch {
      deleted = false;
    }

    if (!deleted) {
      const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (isInput) {
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        const start = input.selectionStart ?? input.value.length;
        if (start > 0) {
          input.value = input.value.slice(0, start - 1) + input.value.slice(start);
          input.selectionStart = input.selectionEnd = start - 1;
          input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }
      } else if (el.isContentEditable) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (!range.collapsed) {
            range.deleteContents();
          } else {
            const node = range.startContainer;
            const offset = range.startOffset;
            if (node.nodeType === Node.TEXT_NODE && offset > 0) {
              (node as Text).deleteData(offset - 1, 1);
            } else if (node.childNodes && offset > 0 && node.childNodes[offset - 1]) {
              node.removeChild(node.childNodes[offset - 1]);
            } else if (node.previousSibling && node.parentNode) {
              node.parentNode.removeChild(node.previousSibling);
            }
          }
          const caret = document.createRange();
          caret.selectNodeContents(el);
          caret.collapse(false);
          sel.removeAllRanges();
          sel.addRange(caret);
        }
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      }
    }
  }

  public async start(): Promise<void> {
    const { text, targetElement, settings, snippetTitle } = this.options;
    const processedText = interpolateSnippetVariables(text);
    const totalLength = processedText.length;
    const emitKeyEvents = settings.antiPasteBypass !== false;
    this.startTime = Date.now();
    this.totalPausedMs = 0;
    this.pauseStartTime = 0;
    this.manualMistakeRequested = false;

    if (targetElement) {
      this.focusElement(targetElement);
    }

    // Auto-Pause & Re-anchoring on Focus Loss / Visibility Change (Fix for tab switching desync)
    this.onVisibilityChange = () => {
      if (document.hidden) {
        if (!this.isPaused && !this.isCancelled) {
          this.pausedDueToFocusLoss = true;
          this.pause();
        }
      } else {
        if (this.pausedDueToFocusLoss && !this.isCancelled) {
          this.pausedDueToFocusLoss = false;
          if (targetElement) {
            this.focusElement(targetElement);
          }
          setTimeout(() => {
            if (!this.isCancelled && !document.hidden) {
              if (targetElement) {
                this.focusElement(targetElement);
              }
              this.resume();
            }
          }, 150);
        }
      }
    };

    this.onWindowBlur = () => {
      if (!this.isPaused && !this.isCancelled) {
        this.pausedDueToFocusLoss = true;
        this.pause();
      }
    };

    this.onWindowFocus = () => {
      if (this.pausedDueToFocusLoss && !this.isCancelled) {
        this.pausedDueToFocusLoss = false;
        if (targetElement) {
          this.focusElement(targetElement);
        }
        setTimeout(() => {
          if (!this.isCancelled) {
            if (targetElement) {
              this.focusElement(targetElement);
            }
            this.resume();
          }
        }, 150);
      }
    };

    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('focus', this.onWindowFocus);

    for (let i = 0; i < totalLength; i++) {
      if (this.isCancelled) {
        this.cleanupListeners();
        return;
      }

      const char = processedText[i];
      const isSpace = char === ' ';
      const isEnter = char === '\n';
      const isClosingChar = char === ')' || char === '}' || char === ']' || char === '"' || char === "'";

      // SMART AUTO-CLOSING BRACKET/QUOTE HANDLING
      // If editor auto-inserted the matching closing bracket/quote right after cursor, step over it instead of duplicating
      if (isClosingChar && targetElement && isNextCharInEditor(targetElement, char)) {
        stepOverChar(targetElement);
        keyboardSound.playKeypress(settings.soundFeedback, settings.soundVolume, false, false);

        const elapsed = Math.max(0, Date.now() - this.startTime - this.totalPausedMs);
        const elapsedMinutes = elapsed / 60000;
        const wordsTyped = (i + 1) / 5;
        const currentWpm = elapsedMinutes > 0 ? Math.round(wordsTyped / elapsedMinutes) : settings.targetWpm;
        const charsPerSec = elapsed > 0 ? Math.round(((i + 1) / (elapsed / 1000)) * 10) / 10 : 0;

        this.lastProgressState = {
          isTyping: true,
          isPaused: this.isPaused,
          snippetTitle,
          fullText: processedText,
          currentIndex: i + 1,
          totalLength,
          currentWpm,
          charsPerSec,
          currentKey: char,
          elapsedMs: elapsed,
          typosCorrected: this.typosCorrected,
        };
        this.options.onProgress?.(this.lastProgressState);

        const delay = calculateCharacterDelay(settings, char);
        await this.wait(delay);
        continue;
      }

      // Check whether to make a mistake (Manual override button/hotkey, or automatic if explicitly configured)
      const isAutomaticMistake =
        settings.mistakeMode === 'automatic' &&
        !isEnter &&
        !isSpace &&
        Math.random() * 100 < settings.typoRatePercent;

      const shouldMakeTypo = (!isEnter && !isSpace) && (this.manualMistakeRequested || isAutomaticMistake);

      if (shouldMakeTypo) {
        this.manualMistakeRequested = false;
        const typoChar = getTypoCharacter(char);
        if (typoChar) {
          // 1. Type the typo
          if (targetElement) {
            if (emitKeyEvents) {
              this.dispatchKeyboardEvent(targetElement, 'keydown', typoChar);
              this.dispatchKeyboardEvent(targetElement, 'keypress', typoChar);
            }
            this.insertCharacterIntoElement(targetElement, typoChar);
            if (emitKeyEvents) {
              this.dispatchKeyboardEvent(targetElement, 'keyup', typoChar);
            }
          }
          keyboardSound.playKeypress(settings.soundFeedback, settings.soundVolume, false, false);

          // 2. Pause in realization
          await this.wait(140 + Math.random() * 90);
          if (this.isCancelled) {
            this.cleanupListeners();
            return;
          }

          // 3. Backspace the typo
          if (targetElement) {
            if (emitKeyEvents) {
              const bsEvent = new KeyboardEvent('keydown', {
                key: 'Backspace',
                code: 'Backspace',
                keyCode: 8,
                which: 8,
                bubbles: true,
                cancelable: true,
                composed: true,
                ctrlKey: false,
                altKey: false,
                metaKey: false,
                shiftKey: false,
              });
              targetElement.dispatchEvent(bsEvent);
            }
            this.backspaceElement(targetElement);
            if (emitKeyEvents) {
              targetElement.dispatchEvent(new KeyboardEvent('keyup', {
                key: 'Backspace',
                code: 'Backspace',
                keyCode: 8,
                which: 8,
                bubbles: true,
                cancelable: true,
                composed: true,
                ctrlKey: false,
                altKey: false,
                metaKey: false,
                shiftKey: false,
              }));
            }
          }
          keyboardSound.playKeypress(settings.soundFeedback, settings.soundVolume, false, false);
          this.typosCorrected++;

          // 4. Pause before typing correct key
          await this.wait(100 + Math.random() * 80);
          if (this.isCancelled) {
            this.cleanupListeners();
            return;
          }
        }
      }

      // Type the correct character
      if (targetElement) {
        if (emitKeyEvents) {
          this.dispatchKeyboardEvent(targetElement, 'keydown', char);
          this.dispatchKeyboardEvent(targetElement, 'keypress', char);
        }
        this.insertCharacterIntoElement(targetElement, char);
        if (emitKeyEvents) {
          this.dispatchKeyboardEvent(targetElement, 'keyup', char);
        }
      }

      // Audio feedback
      keyboardSound.playKeypress(settings.soundFeedback, settings.soundVolume, isSpace, isEnter);

      // SMART CODE INDENTATION RECONCILIATION
      // When Enter is typed, web code editors (Monaco/CodeMirror/Ace/IDE textareas) auto-indent.
      // Reconcile editor's auto-indentation with snippet's next line to prevent cascading blowout.
      if (isEnter && targetElement) {
        await this.wait(12);
        if (this.isCancelled) {
          this.cleanupListeners();
          return;
        }

        const editorIndent = getActiveLineLeadingIndent(targetElement);

        let snippetIndent = '';
        let lookahead = i + 1;
        while (lookahead < totalLength && (processedText[lookahead] === ' ' || processedText[lookahead] === '\t')) {
          snippetIndent += processedText[lookahead];
          lookahead++;
        }

        if (editorIndent.length > 0) {
          if (snippetIndent.startsWith(editorIndent)) {
            // Editor already auto-inserted this indentation: skip typing those duplicate whitespace chars
            i += editorIndent.length;
          } else if (editorIndent.length > snippetIndent.length) {
            // Editor auto-indented more than the snippet wants (e.g. at closing brace or unindented line)
            // Backspace the excess spaces
            const excess = editorIndent.length - snippetIndent.length;
            for (let b = 0; b < excess; b++) {
              if (emitKeyEvents) {
                targetElement.dispatchEvent(new KeyboardEvent('keydown', {
                  key: 'Backspace',
                  code: 'Backspace',
                  keyCode: 8,
                  which: 8,
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  ctrlKey: false,
                  altKey: false,
                  metaKey: false,
                  shiftKey: false,
                }));
              }
              this.backspaceElement(targetElement);
              if (emitKeyEvents) {
                targetElement.dispatchEvent(new KeyboardEvent('keyup', {
                  key: 'Backspace',
                  code: 'Backspace',
                  keyCode: 8,
                  which: 8,
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  ctrlKey: false,
                  altKey: false,
                  metaKey: false,
                  shiftKey: false,
                }));
              }
            }
            i += snippetIndent.length;
          }
        }
      }

      // Calculate stats (strictly excluding paused time)
      const elapsed = Math.max(0, Date.now() - this.startTime - this.totalPausedMs);
      const elapsedMinutes = elapsed / 60000;
      const wordsTyped = (i + 1) / 5;
      const currentWpm = elapsedMinutes > 0 ? Math.round(wordsTyped / elapsedMinutes) : settings.targetWpm;
      const charsPerSec = elapsed > 0 ? Math.round(((i + 1) / (elapsed / 1000)) * 10) / 10 : 0;

      // Report progress
      this.lastProgressState = {
        isTyping: true,
        isPaused: this.isPaused,
        snippetTitle,
        fullText: processedText,
        currentIndex: i + 1,
        totalLength,
        currentWpm,
        charsPerSec,
        currentKey: isEnter ? 'Enter' : isSpace ? 'Space' : char,
        elapsedMs: elapsed,
        typosCorrected: this.typosCorrected,
      };
      this.options.onProgress?.(this.lastProgressState);

      // Calculate next key delay
      const delay = calculateCharacterDelay(settings, char);
      await this.wait(delay);
    }

    this.cleanupListeners();

    // Finished typing!
    if (!this.isCancelled) {
      this.options.onComplete?.();
    }
  }
}
