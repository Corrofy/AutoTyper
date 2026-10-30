/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Download, Puzzle, Volume2, VolumeX } from 'lucide-react';
import { AutoTyperSettings } from '../types/extension.ts';

interface HeaderProps {
  activeTab: 'simulator' | 'snippets' | 'config' | 'export';
  setActiveTab: (tab: 'simulator' | 'snippets' | 'config' | 'export') => void;
  onOpenCommandPalette: () => void;
  onOpenPopupPreview: () => void;
  onDownloadZip: () => void;
  settings: AutoTyperSettings;
  onUpdateSettings: (settings: AutoTyperSettings) => void;
  isDownloadingZip?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenCommandPalette,
  onOpenPopupPreview,
  onDownloadZip,
  settings,
  onUpdateSettings,
  isDownloadingZip = false,
}) => {
  const toggleSound = () => {
    onUpdateSettings({
      ...settings,
      soundFeedback: settings.soundFeedback === 'silent' ? 'cherry-blue' : 'silent',
    });
  };

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      {/* Zone 1: Brand wordmark (single text element) */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('simulator');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0 hover:text-indigo-400 transition-colors flex items-center gap-2"
        >
          <span className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-sm font-mono text-white shadow-sm shadow-indigo-500/30">
            ⌨
          </span>
          AutoTyper Pro
        </a>
      </div>

      {/* Zone 2: 4 clean single-line navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
        <button
          onClick={() => setActiveTab('simulator')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
            activeTab === 'simulator' ? 'text-white border-b-2 border-indigo-500 font-semibold' : ''
          }`}
        >
          Live Simulator
        </button>
        <button
          onClick={() => setActiveTab('snippets')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
            activeTab === 'snippets' ? 'text-white border-b-2 border-indigo-500 font-semibold' : ''
          }`}
        >
          Snippet Library
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
            activeTab === 'config' ? 'text-white border-b-2 border-indigo-500 font-semibold' : ''
          }`}
        >
          Typing Engine
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 ${
            activeTab === 'export' ? 'text-white border-b-2 border-indigo-500 font-semibold' : ''
          }`}
        >
          Extension Exporter
        </button>
      </nav>

      {/* Zone 3: Primary Action & Preview triggers */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={toggleSound}
          title={settings.soundFeedback === 'silent' ? 'Sound: Muted (Click to enable)' : 'Sound: Mechanical clicks enabled'}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Toggle keyboard sound"
        >
          {settings.soundFeedback === 'silent' ? (
            <VolumeX className="w-4 h-4 text-slate-500" />
          ) : (
            <Volume2 className="w-4 h-4 text-indigo-400" />
          )}
        </button>

        <button
          onClick={onOpenCommandPalette}
          title="Open in-page Quick Snippet Palette"
          className="px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 hover:text-white rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 border border-slate-800"
        >
          <span className="text-slate-400">Palette</span>
          <kbd className="text-[10px] font-mono text-indigo-400 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">
            {settings.shortcuts?.openSnippetPicker || 'Alt+K'}
          </kbd>
        </button>

        <button
          onClick={onOpenPopupPreview}
          className="px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 hover:text-white rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 border border-slate-800"
        >
          <Puzzle className="w-3.5 h-3.5 text-indigo-400" />
          <span>Popup</span>
        </button>

        <button
          onClick={onDownloadZip}
          disabled={isDownloadingZip}
          className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 shadow-sm shadow-indigo-600/30 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isDownloadingZip ? 'Packaging...' : 'Download Extension (.zip)'}</span>
        </button>
      </div>
    </header>
  );
};
