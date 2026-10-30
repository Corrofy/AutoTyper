/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Search,
  Play,
  Clipboard,
  Settings,
  Zap,
} from 'lucide-react';
import { Snippet, AutoTyperSettings } from '../types/extension.ts';

interface PopupEmulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  snippets: Snippet[];
  settings: AutoTyperSettings;
  onTriggerSnippet: (snippet: Snippet) => void;
  onTriggerClipboard: () => void;
  onOpenSettings: () => void;
}

export const PopupEmulatorModal: React.FC<PopupEmulatorModalProps> = ({
  isOpen,
  onClose,
  snippets,
  settings,
  onTriggerSnippet,
  onTriggerClipboard,
  onOpenSettings,
}) => {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = snippets.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.shortcutTrigger && s.shortcutTrigger.toLowerCase().includes(search.toLowerCase())) ||
      s.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-end p-6 sm:p-12">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-[360px] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-150 flex flex-col">
        {/* Browser Popup Window Frame */}
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center text-xs font-mono text-white">
              ⌨
            </div>
            <span className="font-bold text-sm text-white">AutoTyper Pro</span>
            <span className="text-[10px] text-slate-500 font-mono">Popup</span>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Popup Body */}
        <div className="p-4 space-y-3">
          {/* Quick Auto-Type Clipboard Button */}
          <button
            onClick={() => {
              onTriggerClipboard();
              onClose();
            }}
            className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/30"
          >
            <Clipboard className="w-3.5 h-3.5" />
            <span>Auto-Type Clipboard ({settings.shortcuts?.autoTypeClipboard || 'Alt+Shift+V'})</span>
          </button>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter snippets (:trigger)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Snippets list */}
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Snippets ({filtered.length})</span>
            <span className="text-[10px] text-indigo-400 font-mono">1-Click Type</span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-0.5">
            {filtered.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                No matching snippets
              </div>
            ) : (
              filtered.map((snip) => (
                <div
                  key={snip.id}
                  onClick={() => {
                    onTriggerSnippet(snip);
                    onClose();
                  }}
                  className="p-2.5 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-lg cursor-pointer flex items-center justify-between transition-colors group"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="text-xs font-medium text-slate-200 truncate group-hover:text-indigo-300">
                      {snip.title}
                    </div>
                    {snip.shortcutTrigger && (
                      <div className="text-[10px] font-mono text-indigo-400">
                        {snip.shortcutTrigger}
                      </div>
                    )}
                  </div>

                  <button className="px-2 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded text-[10px] font-semibold flex items-center gap-1 shrink-0">
                    <Play className="w-2.5 h-2.5 fill-current" />
                    <span>Type</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Popup Footer */}
        <div className="bg-slate-950/80 px-4 py-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1 font-mono text-[11px]">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>{settings.targetWpm} WPM</span>
          </div>

          <button
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <Settings className="w-3 h-3" />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
