/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Sliders,
  ShieldCheck,
  Volume2,
  Keyboard,
  Clock,
  Check,
} from 'lucide-react';
import { AutoTyperSettings, KeyboardSoundType } from '../types/extension.ts';
import { keyboardSound } from '../utils/keyboardSound.ts';
import { ShortcutRecorder } from './ShortcutRecorder.tsx';

interface ConfigTabProps {
  settings: AutoTyperSettings;
  onUpdateSettings: (settings: AutoTyperSettings) => void;
  onResetDefaults: () => void;
}

export const ConfigTab: React.FC<ConfigTabProps> = ({
  settings,
  onUpdateSettings,
  onResetDefaults,
}) => {
  const update = <K extends keyof AutoTyperSettings>(key: K, value: AutoTyperSettings[K]) => {
    onUpdateSettings({ ...settings, [key]: value });
  };

  const handleTestSound = (type: KeyboardSoundType) => {
    keyboardSound.playKeypress(type, settings.soundVolume, false, false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            Typing Engine Configuration
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Fine-tune typing speed, human-like cadence, anti-paste bypass heuristics, and audio feedback.
          </p>
        </div>

        <button
          onClick={onResetDefaults}
          className="px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
        >
          Reset to Defaults
        </button>
      </div>

      <div className="space-y-6 mt-6">
        {/* SECTION 1: SPEED & CADENCE */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Typing Speed &amp; Cadence
              </h2>
            </div>
            <span className="text-xs text-slate-400">
              Mode: <strong className="text-indigo-400 uppercase">{settings.speedMode}</strong>
            </span>
          </div>

          {/* Speed Presets */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
            {[
              { id: 'human', label: 'Human Realistic', desc: '75 WPM + Natural Jitter', wpm: 75, jitter: 35 },
              { id: 'steady', label: 'Steady Rhythm', desc: '45ms fixed per key', wpm: 90, jitter: 10 },
              { id: 'turbo', label: 'Turbo / Fast', desc: '180 WPM high speed', wpm: 180, jitter: 5 },
              { id: 'custom', label: 'Custom Tuning', desc: 'Manual sliders below', wpm: settings.targetWpm, jitter: settings.jitterPercent },
            ].map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  onUpdateSettings({
                    ...settings,
                    speedMode: preset.id as AutoTyperSettings['speedMode'],
                    targetWpm: preset.wpm,
                    jitterPercent: preset.jitter,
                  });
                }}
                className={`p-3 rounded-lg border text-left transition-all ${
                  settings.speedMode === preset.id
                    ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-sm'
                    : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-semibold text-slate-200">{preset.label}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{preset.desc}</div>
              </button>
            ))}
          </div>

          <div className="space-y-5">
            {/* Target WPM */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <label className="font-semibold text-slate-300">
                  Target Speed (Words Per Minute):
                </label>
                <span className="font-mono text-indigo-400 font-bold tabular-nums text-sm">
                  {settings.targetWpm} WPM
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="250"
                step="5"
                value={settings.targetWpm}
                onChange={(e) => update('targetWpm', parseInt(e.target.value, 10))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                <span>20 WPM (Careful)</span>
                <span>75 WPM (Proficient Human)</span>
                <span>130 WPM (Fast)</span>
                <span>250 WPM (Maximum)</span>
              </div>
            </div>

            {/* Jitter / Randomness */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <label className="font-semibold text-slate-300">
                  Human Jitter &amp; Timing Variance:
                </label>
                <span className="font-mono text-indigo-400 font-bold tabular-nums text-sm">
                  {settings.jitterPercent}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="80"
                step="5"
                value={settings.jitterPercent}
                onChange={(e) => update('jitterPercent', parseInt(e.target.value, 10))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Applies authentic Gaussian variance between consecutive keystrokes so typing feels naturally human.
              </p>
            </div>

            {/* Punctuation Pause */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <label className="font-semibold text-slate-300">
                  Punctuation Pause Duration (. , ! ? \n):
                </label>
                <span className="font-mono text-indigo-400 font-bold tabular-nums text-sm">
                  {settings.punctuationPauseMs} ms
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="400"
                step="20"
                value={settings.punctuationPauseMs}
                onChange={(e) => update('punctuationPauseMs', parseInt(e.target.value, 10))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Pauses momentarily at sentence boundaries and paragraph newlines to emulate human thought pacing.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 2: ANTI-PASTE BYPASS & EVENT BEHAVIORS */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Anti-Paste Bypass &amp; Interception
            </h2>
          </div>

          <div className="space-y-4">
            {/* Auto-type on paste */}
            <div className="flex items-start justify-between gap-4 p-3.5 bg-slate-950 border border-slate-800/80 rounded-lg">
              <div>
                <div className="text-xs font-semibold text-slate-200">
                  Auto-Type Clipboard on Paste (Intercept Ctrl+V)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  When enabled, pressing Ctrl+V or right-click paste in any locked form field intercepts the paste event and auto-types the clipboard text character by character instead.
                </div>
              </div>
              <button
                onClick={() => update('autoTypeOnPaste', !settings.autoTypeOnPaste)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.autoTypeOnPaste ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${
                    settings.autoTypeOnPaste ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Anti-paste bypass */}
            <div className="flex items-start justify-between gap-4 p-3.5 bg-slate-950 border border-slate-800/80 rounded-lg">
              <div>
                <div className="text-xs font-semibold text-slate-200">
                  Full KeyboardEvent Emulation (Anti-Bot Bypass)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Dispatches authentic <code className="text-slate-300">keydown</code>, <code className="text-slate-300">keypress</code>, <code className="text-slate-300">beforeinput</code>, and <code className="text-slate-300">keyup</code> events with correct key codes and shift states.
                </div>
              </div>
              <button
                onClick={() => update('antiPasteBypass', !settings.antiPasteBypass)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.antiPasteBypass ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${
                    settings.antiPasteBypass ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Mistake Generation Mode */}
            <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    Mistake / Typo Behavior Mode
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    Choose how mistakes and auto-backspacing are triggered during typing.
                  </div>
                </div>
              </div>

              {/* Segmented Mode Selector */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => update('mistakeMode', 'manual')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    settings.mistakeMode === 'manual'
                      ? 'bg-amber-950/60 border-amber-500 text-amber-200 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-xs font-semibold">Manual Override (Recommended)</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    No random errors. Press button or shortcut ({settings.shortcuts?.triggerMistake || 'Alt+M'}) to make a mistake.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => update('mistakeMode', 'disabled')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    settings.mistakeMode === 'disabled'
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-xs font-semibold">100% Flawless</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Never make any typos or backspaces. Perfect precision.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => update('mistakeMode', 'automatic')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    settings.mistakeMode === 'automatic'
                      ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-xs font-semibold">Random Simulation</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Automatic statistical typos with auto-correction.
                  </div>
                </button>
              </div>

              {settings.mistakeMode === 'manual' && (
                <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-lg text-xs space-y-2">
                  <div className="font-semibold text-amber-300 flex items-center justify-between">
                    <span>Manual Mistake Shortcut:</span>
                    <kbd className="font-mono bg-amber-950 px-2 py-0.5 rounded border border-amber-500/40 text-amber-200">
                      {settings.shortcuts?.triggerMistake || 'Alt+M'}
                    </kbd>
                  </div>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    Whenever you want a realistic mistake while typing into an IDE, code editor, or form, simply press this key combination or click <strong>+Mistake</strong> on the floating HUD. The typist will deliberately hit an adjacent key, pause in human hesitation, hit backspace, and correct it.
                  </p>
                </div>
              )}

              {settings.mistakeMode === 'automatic' && (
                <div className="pt-2 flex items-center gap-3">
                  <span className="text-xs text-slate-400">Random Typo Frequency:</span>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    value={settings.typoRatePercent}
                    onChange={(e) => update('typoRatePercent', parseInt(e.target.value, 10))}
                    className="w-36 accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-indigo-400 tabular-nums">
                    {settings.typoRatePercent}%
                  </span>
                </div>
              )}
            </div>

            {/* In-page HUD */}
            <div className="flex items-start justify-between gap-4 p-3.5 bg-slate-950 border border-slate-800/80 rounded-lg">
              <div>
                <div className="text-xs font-semibold text-slate-200">
                  Show In-Page Floating HUD Pill
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Displays a clean floating pill in the bottom right corner with character progress and an instant Stop button.
                </div>
              </div>
              <button
                onClick={() => update('floatingHudEnabled', !settings.floatingHudEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.floatingHudEnabled ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out ${
                    settings.floatingHudEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* SECTION 3: TACTILE AUDIO FEEDBACK */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Volume2 className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Tactile Mechanical Keyboard Audio
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {[
              { id: 'cherry-blue', label: 'Cherry MX Blue', desc: 'Crisp tactile click' },
              { id: 'cherry-brown', label: 'Cherry MX Brown', desc: 'Rounded tactile thock' },
              { id: 'cherry-red', label: 'Cherry MX Red', desc: 'Smooth linear clack' },
              { id: 'silent', label: 'Silent / Mute', desc: 'No audio playback' },
            ].map((sound) => (
              <div
                key={sound.id}
                onClick={() => {
                  update('soundFeedback', sound.id as KeyboardSoundType);
                  if (sound.id !== 'silent') handleTestSound(sound.id as KeyboardSoundType);
                }}
                className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                  settings.soundFeedback === sound.id
                    ? 'bg-amber-950/40 border-amber-500/80 text-white'
                    : 'bg-slate-950 border-slate-800/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-semibold text-slate-200 flex items-center justify-between">
                  <span>{sound.label}</span>
                  {settings.soundFeedback === sound.id && <Check className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{sound.desc}</div>
              </div>
            ))}
          </div>

          {settings.soundFeedback !== 'silent' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Synthesizer Volume:</span>
                <span className="font-mono text-amber-400 tabular-nums">
                  {Math.round(settings.soundVolume * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.05"
                  value={settings.soundVolume}
                  onChange={(e) => update('soundVolume', parseFloat(e.target.value))}
                  className="flex-1 accent-amber-500 cursor-pointer"
                />
                <button
                  onClick={() => handleTestSound(settings.soundFeedback)}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-amber-300 rounded-lg transition-colors"
                >
                  Test Click
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 4: CUSTOM KEYBOARD SHORTCUTS CONFIGURATION */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Custom Keyboard Shortcuts
              </h2>
            </div>
            <span className="text-xs text-slate-400">Click any shortcut to record key combination</span>
          </div>

          <p className="text-xs text-slate-400 mb-4">
            Configure custom key combinations to trigger the auto-typer, launch the in-page snippet command palette, or open the snippet manager without leaving your active tab.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* 1. Activate Auto-Typing Feature (Clipboard) */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div>
                <span className="font-semibold text-slate-200 block">
                  Activate Auto-Typing (Clipboard Text)
                </span>
                <span className="text-[11px] text-slate-400">
                  Simulates typing the copied text character-by-character into any focused input or form.
                </span>
              </div>
              <ShortcutRecorder
                value={settings.shortcuts?.autoTypeClipboard}
                onChange={(newVal) =>
                  update('shortcuts', {
                    ...settings.shortcuts,
                    autoTypeClipboard: newVal || 'Alt+Shift+V',
                  })
                }
              />
            </div>

            {/* 2. Select Snippet via In-Page Palette */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div>
                <span className="font-semibold text-slate-200 block">
                  Open Quick Snippet Palette
                </span>
                <span className="text-[11px] text-slate-400">
                  Pops up an in-page command palette to search and select a specific snippet to type.
                </span>
              </div>
              <ShortcutRecorder
                value={settings.shortcuts?.openSnippetPicker}
                onChange={(newVal) =>
                  update('shortcuts', {
                    ...settings.shortcuts,
                    openSnippetPicker: newVal || 'Alt+K',
                  })
                }
              />
            </div>

            {/* 3. Open Snippet Management Interface */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div>
                <span className="font-semibold text-slate-200 block">
                  Open Snippet Management Interface
                </span>
                <span className="text-[11px] text-slate-400">
                  Instantly launches the extension options page to create, edit, or delete snippets.
                </span>
              </div>
              <ShortcutRecorder
                value={settings.shortcuts?.openSnippetManager}
                onChange={(newVal) =>
                  update('shortcuts', {
                    ...settings.shortcuts,
                    openSnippetManager: newVal || 'Alt+Shift+O',
                  })
                }
              />
            </div>

            {/* 4. Emergency Stop Typing */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div>
                <span className="font-semibold text-slate-200 block">
                  Emergency Abort Typing
                </span>
                <span className="text-[11px] text-slate-400">
                  Instantly stops any currently active simulated keystroke typing session.
                </span>
              </div>
              <ShortcutRecorder
                value={settings.shortcuts?.stopTyping}
                onChange={(newVal) =>
                  update('shortcuts', {
                    ...settings.shortcuts,
                    stopTyping: newVal || 'Escape',
                  })
                }
              />
            </div>

            {/* 5. Trigger Manual Mistake Override */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div>
                <span className="font-semibold text-slate-200 block">
                  Manual Mistake Trigger Hotkey
                </span>
                <span className="text-[11px] text-slate-400">
                  Hit during typing to make an immediate human error and backspace correction.
                </span>
              </div>
              <ShortcutRecorder
                value={settings.shortcuts?.triggerMistake}
                onChange={(newVal) =>
                  update('shortcuts', {
                    ...settings.shortcuts,
                    triggerMistake: newVal || 'Alt+M',
                  })
                }
              />
            </div>

            {/* 6. Pause / Resume Typing Hotkey */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div>
                <span className="font-semibold text-slate-200 block">
                  Pause / Resume Typing Hotkey
                </span>
                <span className="text-[11px] text-slate-400">
                  Toggle pause/resume during an active typing session.
                </span>
              </div>
              <ShortcutRecorder
                value={settings.shortcuts?.pauseTyping}
                onChange={(newVal) =>
                  update('shortcuts', {
                    ...settings.shortcuts,
                    pauseTyping: newVal || 'Alt+P',
                  })
                }
              />
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-semibold text-slate-300 block">
                Snippet Trigger Abbreviation Key
              </span>
              <span className="text-[11px] text-slate-500">
                Key pressed after typing a prefix abbreviation (e.g. <code className="text-indigo-400">:sig</code>) to expand it.
              </span>
            </div>
            <select
              value={settings.quickTriggerKey}
              onChange={(e) => update('quickTriggerKey', e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="Tab">Tab Key (Default)</option>
              <option value="Space">Spacebar</option>
              <option value="Enter">Enter Key</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
