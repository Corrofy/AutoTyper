/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Keyboard, X, Check } from 'lucide-react';
import { formatKeyboardEvent } from '../utils/shortcutHelper.ts';

interface ShortcutRecorderProps {
  value?: string;
  onChange: (newShortcut: string | undefined) => void;
  placeholder?: string;
  label?: string;
}

export const ShortcutRecorder: React.FC<ShortcutRecorderProps> = ({
  value,
  onChange,
  placeholder = 'None (click to record)',
  label,
}) => {
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setIsRecording(false);
        return;
      }

      const combo = formatKeyboardEvent(e);
      if (combo) {
        onChange(combo);
        setIsRecording(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isRecording, onChange]);

  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-slate-300">{label}</label>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsRecording(true)}
          className={`flex-1 px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between border transition-all ${
            isRecording
              ? 'bg-indigo-950/80 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/20 ring-1 ring-indigo-500 animate-pulse'
              : value
              ? 'bg-slate-950 border-slate-700/80 text-white hover:border-slate-600'
              : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <Keyboard className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate">
              {isRecording ? 'Press key combo (e.g. Alt+Shift+K)...' : value || placeholder}
            </span>
          </div>
          {isRecording && (
            <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-sans">
              Listening...
            </span>
          )}
        </button>

        {value && !isRecording && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="p-2 text-slate-500 hover:text-red-400 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
            title="Clear shortcut"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
