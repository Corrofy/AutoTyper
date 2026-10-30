/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Normalizes and formats a KeyboardEvent into a standard shortcut string (e.g. "Alt+Shift+V", "Ctrl+Alt+S", "Alt+1")
 */
export function formatKeyboardEvent(e: KeyboardEvent): string | null {
  // Ignore bare modifier keydown events
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    return null;
  }

  const parts: string[] = [];

  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');

  // Normalize key
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();

  // If no modifier is pressed and it's not a function key or Escape, avoid single normal characters unless specified
  if (parts.length === 0 && !['Escape', 'Tab', 'Enter', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(key)) {
    // A modifier is required for normal characters to avoid clashing with normal typing
    return null;
  }

  parts.push(key);
  return parts.join('+');
}

/**
 * Matches a KeyboardEvent against a stored shortcut string (e.g. "Alt+Shift+V")
 */
export function matchesShortcut(e: KeyboardEvent, shortcutString?: string): boolean {
  if (!shortcutString) return false;

  const parts = shortcutString.split('+').map((p) => p.trim());
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
