/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pause, Play, Square, Activity, Zap, Plus, Minus } from 'lucide-react';
import { TypingProgressState, TypingSpeedMode } from '../types/extension.ts';

interface TypingHUDProps {
  progress: TypingProgressState | null;
  onPauseToggle: () => void;
  onCancel: () => void;
  onTriggerMistake?: () => void;
  mistakeShortcut?: string;
  targetWpm?: number;
  speedMode?: TypingSpeedMode;
  onSpeedChange?: (newWpm: number) => void;
  onToggleTurbo?: () => void;
}

export const TypingHUD: React.FC<TypingHUDProps> = ({
  progress,
  onPauseToggle,
  onCancel,
  onTriggerMistake,
  mistakeShortcut = 'Alt+M',
  targetWpm = 75,
  speedMode = 'human',
  onSpeedChange,
  onToggleTurbo,
}) => {
  if (!progress || !progress.isTyping) return null;

  const percent = Math.min(100, Math.round((progress.currentIndex / Math.max(1, progress.totalLength)) * 100));

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className={`flex items-center gap-3 bg-slate-900/95 border shadow-2xl backdrop-blur-md px-4 py-2.5 rounded-xl text-slate-200 transition-all ${
        progress.isPaused ? 'border-amber-500/70 shadow-amber-950/30' : 'border-slate-700/80'
      }`}>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${
            progress.isPaused ? 'bg-amber-400' : 'bg-indigo-500 animate-pulse'
          }`} />
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-white max-w-[150px] truncate flex items-center gap-1.5">
              {progress.snippetTitle || 'Auto-Typing'}
              {progress.isPaused && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.2 rounded font-normal">
                  Paused
                </span>
              )}
            </span>
            <span className="text-[11px] text-slate-400 font-mono tabular-nums">
              {progress.currentIndex}/{progress.totalLength} chars · {percent}%
            </span>
          </div>
        </div>

        <div className="h-7 w-[1px] bg-slate-800" />

        {/* Real-time stats */}
        <div className="flex items-center gap-2.5 text-[11px] font-mono tabular-nums text-slate-300">
          <div className="flex items-center gap-1" title="Current typing speed">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span>{progress.isPaused ? '0 (Paused)' : `${progress.currentWpm} WPM`}</span>
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

        {/* Live On-Page Speed Controls */}
        {onSpeedChange && (
          <>
            <div className="h-7 w-[1px] bg-slate-800" />
            <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 rounded-lg p-0.5" title="Adjust typing speed live (Alt+[ / Alt+])">
              <button
                onClick={() => onSpeedChange(Math.max(15, targetWpm - 10))}
                className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Decrease speed by 10 WPM (Alt+[)"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-[11px] font-mono font-semibold text-indigo-300 min-w-[54px] text-center tabular-nums">
                {speedMode === 'turbo' ? 'TURBO' : `${targetWpm} WPM`}
              </span>
              <button
                onClick={() => onSpeedChange(Math.min(300, targetWpm + 10))}
                className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Increase speed by 10 WPM (Alt+])"
              >
                <Plus className="w-3 h-3" />
              </button>
              {onToggleTurbo && (
                <button
                  onClick={onToggleTurbo}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors flex items-center gap-0.5 ml-0.5 ${
                    speedMode === 'turbo'
                      ? 'bg-amber-500/30 text-amber-300 border-amber-500/60 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                  title="Toggle ultra-fast Turbo speed mode"
                >
                  <Zap className="w-2.5 h-2.5 fill-current text-amber-400" />
                  <span>Turbo</span>
                </button>
              )}
            </div>
          </>
        )}

        <div className="h-7 w-[1px] bg-slate-800" />

        {/* Action Controls: Pause/Play, Manual Mistake, Stop */}
        <div className="flex items-center gap-1.5">
          {/* Pause / Resume Button */}
          <button
            onClick={onPauseToggle}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
              progress.isPaused
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950 animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
            title={progress.isPaused ? 'Resume typing (Alt+P)' : 'Pause typing to take a break (Alt+P)'}
          >
            {progress.isPaused ? (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>Resume</span>
              </>
            ) : (
              <>
                <Pause className="w-3 h-3 fill-current text-amber-400" />
                <span>Pause</span>
              </>
            )}
          </button>

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
