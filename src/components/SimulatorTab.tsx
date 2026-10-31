/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Copy,
  Trash2,
  ShieldAlert,
  Code2,
  FileText,
  FormInput,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Snippet, AutoTyperSettings, TypingProgressState, AutoTypeRequest } from '../types/extension.ts';
import { AutoTyperSession } from '../utils/autoTyperEngine.ts';

interface SimulatorTabProps {
  snippets: Snippet[];
  settings: AutoTyperSettings;
  activeSession: AutoTyperSession | null;
  setActiveSession: (session: AutoTyperSession | null) => void;
  typingProgress: TypingProgressState | null;
  setTypingProgress: (progress: TypingProgressState | null) => void;
  onOpenSnippetManager: () => void;
  selectedSnippetId: string;
  setSelectedSnippetId: (id: string) => void;
  autoTypeRequest: AutoTypeRequest | null;
  onAutoTypeRequestHandled: () => void;
}

type TargetFieldType = 'anti-paste' | 'standard' | 'code' | 'rich';

interface DispatchedEventLog {
  id: string;
  type: 'keydown' | 'beforeinput' | 'input' | 'keyup';
  key: string;
  timestamp: string;
}

export const SimulatorTab: React.FC<SimulatorTabProps> = ({
  snippets,
  settings,
  activeSession,
  setActiveSession,
  typingProgress,
  setTypingProgress,
  selectedSnippetId,
  setSelectedSnippetId,
  autoTypeRequest,
  onAutoTypeRequestHandled,
}) => {
  const [customInputText, setCustomInputText] = useState<string>('');
  const [targetField, setTargetField] = useState<TargetFieldType>('anti-paste');
  const [pasteBlockedWarning, setPasteBlockedWarning] = useState<boolean>(false);
  const [eventLogs, setEventLogs] = useState<DispatchedEventLog[]>([]);
  const handledRequestRef = useRef<number | null>(null);

  // Target Element Refs
  const antiPasteInputRef = useRef<HTMLInputElement>(null);
  const standardInputRef = useRef<HTMLInputElement>(null);
  const codeEditorRef = useRef<HTMLTextAreaElement>(null);
  const richTextRef = useRef<HTMLDivElement>(null);

  const selectedSnippet = snippets.find((s) => s.id === selectedSnippetId) || snippets[0];
  const effectiveText = customInputText.trim() ? customInputText : selectedSnippet?.content || '';

  // Get active target DOM element based on user selection
  const getTargetElement = (): HTMLElement | null => {
    switch (targetField) {
      case 'anti-paste':
        return antiPasteInputRef.current;
      case 'standard':
        return standardInputRef.current;
      case 'code':
        return codeEditorRef.current;
      case 'rich':
        return richTextRef.current;
      default:
        return standardInputRef.current;
    }
  };

  // Attach event logging listeners on the target element
  useEffect(() => {
    const el = getTargetElement();
    if (!el) return;

    const logEvent = (e: Event) => {
      const ke = e as KeyboardEvent;
      const type = e.type as 'keydown' | 'beforeinput' | 'input' | 'keyup';
      const keyName = ke.key || (e as InputEvent).data || e.type;

      setEventLogs((prev) => [
        {
          id: Math.random().toString(36).substring(2, 9),
          type,
          key: keyName,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        },
        ...prev.slice(0, 19), // keep last 20 events
      ]);
    };

    el.addEventListener('keydown', logEvent);
    el.addEventListener('beforeinput', logEvent);
    el.addEventListener('input', logEvent);
    el.addEventListener('keyup', logEvent);

    return () => {
      el.removeEventListener('keydown', logEvent);
      el.removeEventListener('beforeinput', logEvent);
      el.removeEventListener('input', logEvent);
      el.removeEventListener('keyup', logEvent);
    };
  }, [targetField]);

  // Launch AutoTyper Session
  const startSession = useCallback((text: string, title: string, targetEl?: HTMLElement | null) => {
    if (!text) return;

    if (activeSession) {
      activeSession.cancel();
      setActiveSession(null);
    }

    const element = targetEl || getTargetElement();
    if (!element) return;

    const session = new AutoTyperSession({
      text,
      targetElement: element,
      settings,
      snippetTitle: title,
      onProgress: (prog) => {
        setTypingProgress(prog);
      },
      onComplete: () => {
        setTypingProgress(null);
        setActiveSession(null);
      },
      onCancel: () => {
        setTypingProgress(null);
        setActiveSession(null);
      },
    });

    setActiveSession(session);
    void session.start();
  }, [activeSession, settings, targetField, setActiveSession, setTypingProgress]);

  // Handle paste attempt across target fields (anti-paste block simulation vs auto-type intercept)
  const handlePaste = (e: React.ClipboardEvent, isAntiPasteField = false) => {
    if (settings.autoTypeOnPaste) {
      e.preventDefault();
      const clipText = e.clipboardData?.getData('text/plain') || '';
      if (clipText) {
        startSession(clipText, 'Auto-Typing Paste', e.currentTarget as HTMLElement);
        return;
      }
    }
    if (isAntiPasteField) {
      e.preventDefault();
      setPasteBlockedWarning(true);
      setTimeout(() => setPasteBlockedWarning(false), 4000);
    }
  };

  // Shortcut Prefix Expansion (e.g. typing ':sig' followed by Space or Enter)
  const handleTargetKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const triggerKey = settings.quickTriggerKey || 'Space';
    const isTrigger =
      e.key === triggerKey ||
      (triggerKey === 'Space' && e.key === ' ');

    if (isTrigger) {
      const target = e.currentTarget;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        const pos = target.selectionStart ?? target.value.length;
        const textBefore = target.value.slice(0, pos);
        const match = textBefore.match(/(:[a-zA-Z0-9_-]+|![a-zA-Z0-9_-]+)$/);
        if (match) {
          const trigger = match[1];
          const found = snippets.find((s) => s.shortcutTrigger === trigger);
          if (found) {
            e.preventDefault();
            const start = pos - trigger.length;
            target.value = target.value.slice(0, start) + target.value.slice(pos);
            target.selectionStart = target.selectionEnd = start;
            target.dispatchEvent(new Event('input', { bubbles: true }));
            startSession(found.content, found.title, target);
          }
        }
      }
    }
  };

  const startAutoTyping = () => {
    const title = customInputText.trim() ? 'Custom Snippet' : selectedSnippet?.title || 'Auto-Type';
    startSession(effectiveText, title);
  };

  // Start a session requested by another tab, the palette, the popup preview,
  // a per-snippet hotkey, or the clipboard shortcut.
  useEffect(() => {
    if (!autoTypeRequest) return;
    if (handledRequestRef.current === autoTypeRequest.id) return;

    handledRequestRef.current = autoTypeRequest.id;
    setCustomInputText('');
    const element = getTargetElement();
    startSession(autoTypeRequest.text, autoTypeRequest.title, element);
    onAutoTypeRequestHandled();
  }, [autoTypeRequest, targetField, startSession, onAutoTypeRequestHandled]);

  const handleClearTarget = () => {
    if (activeSession) {
      activeSession.cancel();
      setActiveSession(null);
      setTypingProgress(null);
    }
    const el = getTargetElement();
    if (!el) return;

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el.isContentEditable) {
      el.innerText = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setEventLogs([]);
  };

  const handleReadClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setCustomInputText(text);
      }
    } catch {
      // Permission prompt fallback
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Top Banner introducing the simulator */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            AutoTyper Live Simulator
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Test realistic keystroke emulation, paste interception, and anti-paste bypass before installing the extension.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs text-slate-400 flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
            <span>Palette:</span>
            <kbd className="font-mono text-indigo-400 font-semibold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
              {settings.shortcuts?.openSnippetPicker || 'Alt+K'}
            </kbd>
            <span>·</span>
            <span>Clipboard:</span>
            <kbd className="font-mono text-indigo-400 font-semibold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
              {settings.shortcuts?.autoTypeClipboard || 'Alt+Shift+V'}
            </kbd>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6 items-start">
        {/* LEFT COLUMN: Controls & Snippet Selector (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          {/* Snippet Picker Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Snippet to Auto-Type
              </label>
              <span className="text-[11px] text-indigo-400 font-mono">
                {snippets.length} available
              </span>
            </div>

            <select
              value={selectedSnippetId}
              onChange={(e) => {
                setSelectedSnippetId(e.target.value);
                setCustomInputText('');
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 mb-3"
            >
              {snippets.map((snip) => (
                <option key={snip.id} value={snip.id}>
                  {snip.title} ({snip.shortcutTrigger || snip.category})
                </option>
              ))}
            </select>

            {/* Snippet preview or custom text input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Snippet Content or Custom Text:</span>
                <button
                  onClick={handleReadClipboard}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  Paste from Clipboard
                </button>
              </div>

              <textarea
                value={customInputText || selectedSnippet?.content || ''}
                onChange={(e) => setCustomInputText(e.target.value)}
                placeholder="Paste or write anything here to test auto-typing..."
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500 resize-y"
              />
            </div>

            {/* Trigger Button */}
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={startAutoTyping}
                disabled={typingProgress?.isTyping}
                className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm shadow-indigo-600/30"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{typingProgress?.isTyping ? 'Typing in Progress...' : 'Auto-Type into Target'}</span>
              </button>

              <button
                onClick={handleClearTarget}
                title="Clear target field"
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Target Element Selector Tabs */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-3">
              Target Test Environment
            </label>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => setTargetField('anti-paste')}
                className={`p-2.5 rounded-lg border text-left flex items-start gap-2.5 transition-colors ${
                  targetField === 'anti-paste'
                    ? 'bg-red-950/40 border-red-500/60 text-red-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                <div>
                  <div className="font-semibold text-slate-200">Strict Anti-Paste</div>
                  <div className="text-[11px] text-slate-400">Blocks Ctrl+V / Right Click</div>
                </div>
              </button>

              <button
                onClick={() => setTargetField('standard')}
                className={`p-2.5 rounded-lg border text-left flex items-start gap-2.5 transition-colors ${
                  targetField === 'standard'
                    ? 'bg-indigo-950/40 border-indigo-500/60 text-indigo-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FormInput className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
                <div>
                  <div className="font-semibold text-slate-200">Standard Input</div>
                  <div className="text-[11px] text-slate-400">Basic text field</div>
                </div>
              </button>

              <button
                onClick={() => setTargetField('code')}
                className={`p-2.5 rounded-lg border text-left flex items-start gap-2.5 transition-colors ${
                  targetField === 'code'
                    ? 'bg-indigo-950/40 border-indigo-500/60 text-indigo-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                <div>
                  <div className="font-semibold text-slate-200">Code Editor</div>
                  <div className="text-[11px] text-slate-400">Multi-line editor</div>
                </div>
              </button>

              <button
                onClick={() => setTargetField('rich')}
                className={`p-2.5 rounded-lg border text-left flex items-start gap-2.5 transition-colors ${
                  targetField === 'rich'
                    ? 'bg-indigo-950/40 border-indigo-500/60 text-indigo-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div>
                  <div className="font-semibold text-slate-200">Rich Document</div>
                  <div className="text-[11px] text-slate-400">ContentEditable doc</div>
                </div>
              </button>
            </div>
          </div>

          {/* Real-time Keystroke Dispatch Inspector */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Keystroke Event Inspector
              </span>
              <span className="text-[11px] text-slate-500 font-mono">Live DOM Events</span>
            </div>

            <div className="h-44 overflow-y-auto bg-slate-950 border border-slate-800/80 rounded-lg p-2 font-mono text-[11px] space-y-1">
              {eventLogs.length === 0 ? (
                <div className="text-slate-600 text-center py-12">
                  No keystroke events yet. Click &quot;Auto-Type into Target&quot; to see live DOM event dispatches.
                </div>
              ) : (
                eventLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between px-2 py-1 rounded bg-slate-900/60 text-slate-300">
                    <span
                      className={`font-semibold ${
                        log.type === 'keydown'
                          ? 'text-indigo-400'
                          : log.type === 'keyup'
                          ? 'text-sky-400'
                          : log.type === 'beforeinput'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {log.type}
                    </span>
                    <span className="text-slate-200 font-bold bg-slate-800 px-1.5 py-0.5 rounded">
                      &apos;{log.key === '\n' ? '\\n' : log.key}&apos;
                    </span>
                    <span className="text-slate-500 tabular-nums text-[10px]">{log.timestamp}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: The Interactive Target Web Page (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            {/* Simulated Browser Address Bar */}
            <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
              </div>
              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-md px-3 py-1 text-xs font-mono text-slate-400 flex items-center justify-between">
                <span className="truncate">
                  {targetField === 'anti-paste'
                    ? 'https://secure-portal.exam-center.internal/verification'
                    : targetField === 'code'
                    ? 'https://cloud-ide.internal/workspace/editor.ts'
                    : 'https://app.client-portal.internal/forms'}
                </span>
                <span className="text-[10px] text-emerald-400">🔒 HTTPS</span>
              </div>
            </div>

            {/* Target Area Body */}
            <div className="p-6 bg-slate-900/50 min-h-[460px] flex flex-col justify-between">
              {/* TARGET 1: STRICT ANTI-PASTE INPUT */}
              {targetField === 'anti-paste' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-white flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-red-400" />
                        Strict Anti-Paste Field (Proctored / Banking Simulation)
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        This field actively blocks clipboard paste events. Try pasting with Ctrl+V to test the block!
                      </p>
                    </div>
                  </div>

                  {pasteBlockedWarning && (
                    <div className="p-3 bg-red-950/70 border border-red-500/50 rounded-lg text-xs text-red-200 flex items-center gap-2 animate-in fade-in duration-150">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <div>
                        <strong>Clipboard Paste Blocked!</strong> Normal paste was rejected by the page&apos;s anti-paste script.
                        Use <strong>AutoTyper Pro</strong> to type it naturally via simulated keystrokes!
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">
                      Security Token / Authentication Checksum:
                    </label>
                    <input
                      ref={antiPasteInputRef}
                      type="text"
                      onPaste={(e) => handlePaste(e, true)}
                      onKeyDown={handleTargetKeyDown}
                      placeholder="Try pasting with Ctrl+V (Blocked!) or click Auto-Type..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500 shadow-inner"
                    />
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <span>Security Policy:</span>
                      <code className="text-red-400 bg-red-950/30 px-1 py-0.5 rounded">
                        onpaste=&quot;return false;&quot;
                      </code>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-300 space-y-2">
                    <div className="font-semibold text-white flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      How AutoTyper Bypasses Anti-Paste Restrictions:
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                      Anti-paste scripts listen for the native <code className="text-slate-300">paste</code> event. AutoTyper bypasses this restriction by generating authentic <code className="text-slate-300">KeyboardEvents</code> (<code className="text-slate-300">keydown</code>, <code className="text-slate-300">keypress</code>, <code className="text-slate-300">keyup</code>) and <code className="text-slate-300">InputEvents</code>, exactly as if a human was pressing physical keys on a mechanical keyboard.
                    </p>
                  </div>
                </div>
              )}

              {/* TARGET 2: STANDARD INPUT */}
              {targetField === 'standard' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-white flex items-center gap-2">
                      <FormInput className="w-4 h-4 text-indigo-400" />
                      Standard Web Form Input
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Works on login forms, search bars, customer feedback inputs, and prompt boxes.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Recipient Email / Subject:</label>
                    <input
                      ref={standardInputRef}
                      type="text"
                      onPaste={(e) => handlePaste(e, false)}
                      onKeyDown={handleTargetKeyDown}
                      placeholder="Focus here and auto-type..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* TARGET 3: CODE EDITOR */}
              {targetField === 'code' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-white flex items-center gap-2">
                        <Code2 className="w-4 h-4 text-emerald-400" />
                        Code Editor / IDE Terminal
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Types multi-line snippets with authentic indentation and newlines.
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400">TypeScript / SQL</span>
                  </div>

                  <div className="space-y-1.5">
                    <textarea
                      ref={codeEditorRef}
                      rows={12}
                      onPaste={(e) => handlePaste(e, false)}
                      onKeyDown={handleTargetKeyDown}
                      placeholder="// Code editor canvas. Click 'Auto-Type into Target' to stream code..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-emerald-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 leading-relaxed resize-none"
                    />
                  </div>
                </div>
              )}

              {/* TARGET 4: RICH TEXT / CONTENTEDITABLE */}
              {targetField === 'rich' && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-base font-semibold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-400" />
                      Rich Text Document (Google Docs / Notion / Slack style)
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Targeting <code className="text-amber-300 font-mono">contenteditable=&quot;true&quot;</code> elements seamlessly.
                    </p>
                  </div>

                  <div
                    ref={richTextRef}
                    contentEditable
                    suppressContentEditableWarning
                    onPaste={(e) => handlePaste(e, false)}
                    data-placeholder="Click here and auto-type your rich text notes..."
                    className="w-full min-h-[220px] bg-slate-950 border border-slate-800 rounded-lg p-4 text-sm text-slate-200 focus:outline-none focus:border-amber-500 leading-relaxed empty:before:content-[attr(data-placeholder)] empty:before:text-slate-600"
                  />
                </div>
              )}

              {/* Status bar in sandbox footer */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-3">
                  <span>Target Status:</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ready for input
                  </span>
                </div>
                <button
                  onClick={handleClearTarget}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear Field
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
