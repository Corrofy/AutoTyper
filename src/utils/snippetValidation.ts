/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Snippet } from '../types/extension.ts';

const VALID_CATEGORIES: Snippet['category'][] = [
  'email',
  'code',
  'forms',
  'chat',
  'testing',
  'custom',
];

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

/**
 * Lenient cleanup for data loaded from localStorage. Invalid entries are
 * dropped instead of crashing the UI with `undefined.forEach`.
 */
export function sanitizeSnippets(input: unknown): Snippet[] {
  if (!Array.isArray(input)) return [];

  const result: Snippet[] = [];
  input.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const entry = raw as Record<string, unknown>;
    const title = asTrimmedString(entry.title);
    const content = typeof entry.content === 'string' ? entry.content : '';
    if (!title || !content) return;

    const category = VALID_CATEGORIES.includes(entry.category as Snippet['category'])
      ? (entry.category as Snippet['category'])
      : 'custom';

    const tags = Array.isArray(entry.tags)
      ? entry.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
      : [];

    result.push({
      id: asTrimmedString(entry.id) || `snip-imported-${index}-${Date.now().toString(36)}`,
      title,
      content,
      category,
      tags,
      shortcutTrigger: asTrimmedString(entry.shortcutTrigger) || undefined,
      keyboardShortcut: asTrimmedString(entry.keyboardShortcut) || undefined,
      description: asTrimmedString(entry.description) || undefined,
      createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
      useCount: typeof entry.useCount === 'number' ? entry.useCount : 0,
    });
  });

  return result;
}

/**
 * Strict validation for user-selected JSON files. Throws a descriptive error
 * so the import UI can explain exactly which entry is invalid.
 */
export function normalizeImportedSnippets(input: unknown): Snippet[] {
  if (!Array.isArray(input)) {
    throw new Error('Expected a JSON array of snippets.');
  }

  return input.map((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Snippet #${index + 1} is not an object.`);
    }

    const entry = raw as Record<string, unknown>;
    const title = asTrimmedString(entry.title);
    const content = typeof entry.content === 'string' ? entry.content : '';
    if (!title || !content) {
      throw new Error(`Snippet #${index + 1} needs non-empty "title" and "content" fields.`);
    }

    return sanitizeSnippets([{ ...entry, title, content }])[0];
  });
}
