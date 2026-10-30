/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pause, Play, Square, Activity, Zap } from 'lucide-react';
import { TypingProgressState } from '../types/extension.ts';

interface TypingHUDProps {
  progress: TypingProgressState | null;
  onPauseToggle: () => void;
  onCancel: () => void;
  onTriggerMistake?: () => void;
  mistakeShortcut?: string;
}

export const TypingHUD: React.FC<TypingHUDProps> = ({
  progress,
  onPauseToggle,
  onCancel,
  onTriggerMistake,
  mistakeShortcut = 'Alt+M',
}) => {
  if (!progress || !progress.isTyping) return null;

  const percent = Math.min(100, Math.round((progress.currentIndex / Math.max(1, progress.totalLength)) * 100));

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className="flex items-center gap-3 bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-md px-4 py-2.5 rounded-xl text-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-white max-w-[150px] truncate">
              {progress.snippetTitle || 'Auto-Typing'}
            </span>
            <span className="text-[11px] text-slate-400 font-mono tabular-nums">
              {progress.currentIndex}/{progress.totalLength} chars · {percent}%
            </span>
          </div>
        </div>

        <div className="h-7 w-[1px] bg-slate-800" />

        {/* Real-time stats */}
        <div className="flex items-center gap-2.5 text-[11px] font-mono tabular-nums text-slate-300">
          <div className="flex items-center gap-1" title="Real-time typing speed">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span>{progress.currentWpm} WPM</span>
          </div>
          <div className="flex items-center gap-1" title="Current simulated key">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-amber-300">
              {progress.currentKey === ' ' ? 'SPC' : progress.currentKey}
            </span>
          </div>
          {progress.typosCorrected > 0 && (
            <span className="text-emerald-400 text-[10px]" title="Typo corrections made">
              +{progress.typosCorrected} typos
            </span>
          )}
        </div>

        <div className="h-7 w-[1px] bg-slate-800" />

        {/* Action Controls & Manual Mistake Override */}
        <div className="flex items-center gap-1.5">
          {onTriggerMistake && (
            <button
              onClick={onTriggerMistake}
              className="px-2 py-1 text-[11px] font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-md transition-colors flex items-center gap-1"
              title={`Inject a mistake and auto-correct it right now (${mistakeShortcut})`}
            >
              <span>+Mistake</span>
              <kbd className="text-[9px] bg-amber-950 px-1 py-0.5 rounded font-mono text-amber-200">
                {mistakeShortcut}
              </kbd>
            </button>
          )}

          <button
            onClick={onPauseToggle}
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            title={progress.isPaused ? 'Resume typing' : 'Pause typing'}
          >
            {progress.isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
          </button>
          <button
            onClick={onCancel}
            className="px-2 py-1 text-[11px] font-medium bg-red-600/80 hover:bg-red-600 text-white rounded-md transition-colors flex items-center gap-1"
            title="Cancel typing (Esc)"
          >
            <Square className="w-2.5 h-2.5 fill-current" />
            <span>Stop</span>
          </button>
        </div>
      </div>
    </div>
  );
};
