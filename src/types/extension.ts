/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Snippet {
  id: string;
  title: string;
  content: string;
  category: 'email' | 'code' | 'forms' | 'chat' | 'testing' | 'custom';
  tags: string[];
  shortcutTrigger?: string; // e.g. ":email" or "!sig"
  keyboardShortcut?: string; // e.g. "Alt+1", "Ctrl+Alt+S", "Alt+Shift+P"
  description?: string;
  createdAt: number;
  useCount: number;
}

export type TypingSpeedMode = 'human' | 'steady' | 'turbo' | 'custom';

export type KeyboardSoundType = 'silent' | 'cherry-blue' | 'cherry-brown' | 'cherry-red';

export interface CustomShortcutsConfig {
  autoTypeClipboard: string; // Default: "Alt+Shift+V"
  openSnippetPicker: string; // Default: "Alt+K"
  openSnippetManager: string; // Default: "Alt+Shift+O"
  stopTyping: string; // Default: "Escape"
  triggerMistake: string; // Default: "Alt+M" (manual mistake injection)
  pauseTyping?: string; // Default: "Alt+P" (toggle pause/resume)
}

export type MistakeTriggerMode = 'manual' | 'automatic' | 'disabled';

export interface AutoTyperSettings {
  speedMode: TypingSpeedMode;
  targetWpm: number; // Words Per Minute (e.g. 75)
  baseDelayMs: number; // Base delay per character in ms (e.g. 45ms)
  jitterPercent: number; // Random variance: 0 to 100%
  punctuationPauseMs: number; // Extra pause for . , ! ? \n
  mistakeMode: MistakeTriggerMode; // 'manual' (default) | 'automatic' | 'disabled'
  typoSimulation: boolean; // Deprecated flag, kept for backward compatibility
  typoRatePercent: number; // Typo chance for automatic mode: 1% to 10%
  autoTypeOnPaste: boolean; // Intercept Ctrl+V / paste event and auto-type clipboard
  antiPasteBypass: boolean; // Emit trusted-like KeyboardEvents and InputEvents to bypass anti-paste scripts
  soundFeedback: KeyboardSoundType;
  soundVolume: number; // 0.0 to 1.0
  quickTriggerKey: string; // Key to expand shortcut prefix (e.g. "Space")
  spacesPerTab: number; // Number of spaces to emit for each tab character (default 4)
  floatingHudEnabled: boolean; // Show floating pill indicator when typing in page
  stopOnEscape: boolean; // Hit Escape to cancel ongoing typing
  shortcuts: CustomShortcutsConfig;
}

export interface TypingProgressState {
  isTyping: boolean;
  isPaused: boolean;
  snippetTitle: string;
  fullText: string;
  currentIndex: number;
  totalLength: number;
  currentWpm: number;
  charsPerSec: number;
  currentKey: string;
  elapsedMs: number;
  typosCorrected: number;
}

export interface GeneratedExtensionFile {
  name: string;
  path: string;
  language: 'json' | 'javascript' | 'html' | 'css' | 'markdown' | 'xml' | 'png';
  content: string;
  description: string;
  /** How `content` should be written. PNG assets are stored as base64 strings. */
  encoding?: 'utf8' | 'base64';
}

export interface AutoTypeRequest {
  id: number;
  text: string;
  title: string;
  snippetId?: string;
}

export type TargetBrowser = 'chrome' | 'firefox' | 'edge' | 'brave' | 'opera';
