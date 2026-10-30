/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Search, Play, X, Keyboard, Hash } from 'lucide-react';
import { Snippet } from '../types/extension.ts';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  snippets: Snippet[];
  onSelectSnippet: (snippet: Snippet) => void;
  shortcutLabel?: string;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  snippets,
  onSelectSnippet,
  shortcutLabel = 'Alt+K',
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = snippets.filter((s) => {
    const q = query.toLowerCase();
    return (
      !q ||
      s.title.toLowerCase().includes(q) ||
      (s.shortcutTrigger && s.shortcutTrigger.toLowerCase().includes(q)) ||
      s.tags.some((t) => t.toLowerCase().includes(q)) ||
      s.content.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelectSnippet(filtered[selectedIndex]);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="relative border-b border-slate-800 bg-slate-950 flex items-center px-4">
          <Search className="w-4 h-4 text-slate-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search snippets by name, tag, or trigger (:prefix)..."
            className="w-full bg-transparent py-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-slate-500 font-mono">
            <kbd className="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">{shortcutLabel}</kbd>
            <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No snippets found matching &quot;{query}&quot;
            </div>
          ) : (
            filtered.map((snip, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={snip.id}
                  onClick={() => {
                    onSelectSnippet(snip);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`p-3 rounded-xl cursor-pointer flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-indigo-600/20 border border-indigo-500/50 text-white'
                      : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-100 truncate">
                        {snip.title}
                      </span>
                      {snip.shortcutTrigger && (
                        <code className="text-[10px] font-mono text-indigo-400 bg-indigo-950/80 px-1 py-0.5 rounded">
                          {snip.shortcutTrigger}
                        </code>
                      )}
                      {snip.keyboardShortcut && (
                        <kbd className="text-[10px] font-mono text-amber-300 bg-amber-950/60 border border-amber-800/40 px-1.5 py-0.5 rounded">
                          {snip.keyboardShortcut}
                        </kbd>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 truncate">
                      <span className="capitalize">{snip.category}</span>
                      {snip.tags.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 truncate">
                            <Hash className="w-3 h-3 text-slate-500" />
                            {snip.tags.join(', ')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 shrink-0">
                    <Play className="w-3 h-3 fill-current" />
                    <span>Type</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Navigation hints */}
        <div className="bg-slate-950 px-4 py-2 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="bg-slate-800 px-1 py-0.5 rounded text-[10px] font-mono text-slate-400 mr-1">↑↓</kbd>
              Navigate
            </span>
            <span>
              <kbd className="bg-slate-800 px-1 py-0.5 rounded text-[10px] font-mono text-slate-400 mr-1">↵</kbd>
              Auto-Type
            </span>
            <span>
              <kbd className="bg-slate-800 px-1 py-0.5 rounded text-[10px] font-mono text-slate-400 mr-1">Esc</kbd>
              Close
            </span>
          </div>
          <span className="text-slate-400 font-mono tabular-nums">{filtered.length} snippets</span>
        </div>
      </div>
    </div>
  );
};
