/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header.tsx';
import { SimulatorTab } from './components/SimulatorTab.tsx';
import { SnippetsTab } from './components/SnippetsTab.tsx';
import { ConfigTab } from './components/ConfigTab.tsx';
import { ExportTab } from './components/ExportTab.tsx';
import { TypingHUD } from './components/TypingHUD.tsx';
import { PopupEmulatorModal } from './components/PopupEmulatorModal.tsx';
import { CommandPaletteModal } from './components/CommandPaletteModal.tsx';
import { Snippet, AutoTyperSettings, TypingProgressState, AutoTypeRequest, TargetBrowser } from './types/extension.ts';
import { DEFAULT_SNIPPETS, DEFAULT_SETTINGS } from './data/defaultSnippets.ts';
import { AutoTyperSession } from './utils/autoTyperEngine.ts';
import { createExtensionZip } from './utils/extensionGenerator.ts';
import { matchesShortcut } from './utils/shortcutHelper.ts';
import { sanitizeSnippets } from './utils/snippetValidation.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'snippets' | 'config' | 'export'>('simulator');
  const [isPopupPreviewOpen, setIsPopupPreviewOpen] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [exportBrowser, setExportBrowser] = useState<TargetBrowser>('chrome');
  const [autoTypeRequest, setAutoTypeRequest] = useState<AutoTypeRequest | null>(null);

  // Load and persist snippets
  const [snippets, setSnippets] = useState<Snippet[]>(() => {
    try {
      const saved = localStorage.getItem('autotyper_snippets');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const safe = sanitizeSnippets(parsed);
          if (safe.length > 0 || parsed.length === 0) return safe;
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_SNIPPETS;
  });

  // Load and persist settings
  const [settings, setSettings] = useState<AutoTyperSettings>(() => {
    try {
      const saved = localStorage.getItem('autotyper_settings');
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('autotyper_snippets', JSON.stringify(snippets));
    } catch {
      // ignore
    }
  }, [snippets]);

  useEffect(() => {
    try {
      localStorage.setItem('autotyper_settings', JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Active Typing Session State
  const [activeSession, setActiveSession] = useState<AutoTyperSession | null>(null);
  const [typingProgress, setTypingProgress] = useState<TypingProgressState | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const [selectedSnippetId, setSelectedSnippetId] = useState<string>(() => snippets[0]?.id || '');

  const requestAutoType = useCallback((text: string, title: string, snippetId?: string) => {
    if (!text) return;
    if (snippetId) setSelectedSnippetId(snippetId);
    setActiveTab('simulator');
    setAutoTypeRequest({
      id: Date.now() + Math.random(),
      text,
      title,
      snippetId,
    });
  }, []);

  const handleAutoTypeRequestHandled = useCallback(() => {
    setAutoTypeRequest(null);
  }, []);

  const requestClipboardAutoType = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        alert('The clipboard is empty.');
        return;
      }
      requestAutoType(text, 'Clipboard Text');
    } catch (err) {
      console.error('Clipboard read failed:', err);
      alert('Could not read the clipboard. Grant clipboard permission and try again.');
    }
  }, [requestAutoType]);

  // Global Custom Keyboard Shortcuts Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Emergency Stop
      const stopKey = settings.shortcuts?.stopTyping || 'Escape';
      const shouldStop = matchesShortcut(e, stopKey) || (settings.stopOnEscape && e.key === 'Escape');
      if (shouldStop && activeSession) {
        e.preventDefault();
        activeSession.cancel();
        setActiveSession(null);
        setTypingProgress(null);
        return;
      }

      // 2. Manual Mistake Trigger during active typing
      const mistakeKey = settings.shortcuts?.triggerMistake || 'Alt+M';
      if (matchesShortcut(e, mistakeKey) && activeSession) {
        e.preventDefault();
        activeSession.triggerManualMistake();
        return;
      }

      // 3. Open Snippet Command Palette (e.g. Alt+K or Alt+Shift+K)
      const pickerKey = settings.shortcuts?.openSnippetPicker || 'Alt+K';
      if (matchesShortcut(e, pickerKey)) {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
        return;
      }

      // 4. Open Snippet Manager (e.g. Alt+Shift+O)
      const managerKey = settings.shortcuts?.openSnippetManager || 'Alt+Shift+O';
      if (matchesShortcut(e, managerKey)) {
        e.preventDefault();
        setActiveTab('snippets');
        return;
      }

      // 5. Auto-Type Clipboard (e.g. Alt+Shift+V)
      const clipboardKey = settings.shortcuts?.autoTypeClipboard || 'Alt+Shift+V';
      if (matchesShortcut(e, clipboardKey)) {
        e.preventDefault();
        void requestClipboardAutoType();
        return;
      }

      // 6. Per-Snippet Keyboard Shortcuts (e.g. Alt+1, Alt+2, Ctrl+Alt+S)
      for (const snip of snippets) {
        if (snip.keyboardShortcut && matchesShortcut(e, snip.keyboardShortcut)) {
          e.preventDefault();
          requestAutoType(snip.content, snip.title, snip.id);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeSession, settings.shortcuts, settings.stopOnEscape, snippets, requestAutoType, requestClipboardAutoType]);

  // Download Extension Zip
  const handleDownloadZip = async () => {
    try {
      setIsDownloadingZip(true);
      const zipBlob = await createExtensionZip(snippets, settings, exportBrowser);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportBrowser === 'firefox'
        ? 'autotyper-pro-firefox.zip'
        : 'autotyper-pro-chromium.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create extension zip:', err);
      alert('Error bundling extension: ' + err);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleTestSnippetFromLibrary = (snippet: Snippet) => {
    requestAutoType(snippet.content, snippet.title, snippet.id);
  };

  const handlePauseToggle = useCallback(() => {
    if (activeSession) {
      const isPaused = activeSession.togglePause();
      setTypingProgress((prev) => (prev ? { ...prev, isPaused } : null));
    }
  }, [activeSession]);

  const handleCancelTyping = useCallback(() => {
    if (activeSession) {
      activeSession.cancel();
      setActiveSession(null);
      setTypingProgress(null);
    }
  }, [activeSession]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* 3-Zone Header Contract */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenPopupPreview={() => setIsPopupPreviewOpen(true)}
        onDownloadZip={handleDownloadZip}
        settings={settings}
        onUpdateSettings={setSettings}
        isDownloadingZip={isDownloadingZip}
      />

      {/* Main View Area */}
      <main className="flex-1 pb-16">
        {activeTab === 'simulator' && (
          <SimulatorTab
            snippets={snippets}
            settings={settings}
            activeSession={activeSession}
            setActiveSession={setActiveSession}
            typingProgress={typingProgress}
            setTypingProgress={setTypingProgress}
            onOpenSnippetManager={() => setActiveTab('snippets')}
            selectedSnippetId={selectedSnippetId}
            setSelectedSnippetId={setSelectedSnippetId}
            autoTypeRequest={autoTypeRequest}
            onAutoTypeRequestHandled={handleAutoTypeRequestHandled}
          />
        )}

        {activeTab === 'snippets' && (
          <SnippetsTab
            snippets={snippets}
            onUpdateSnippets={setSnippets}
            onTestSnippet={handleTestSnippetFromLibrary}
          />
        )}

        {activeTab === 'config' && (
          <ConfigTab
            settings={settings}
            onUpdateSettings={setSettings}
            onResetDefaults={() => setSettings(DEFAULT_SETTINGS)}
          />
        )}

        {activeTab === 'export' && (
          <ExportTab
            snippets={snippets}
            settings={settings}
            onDownloadZip={handleDownloadZip}
            isDownloadingZip={isDownloadingZip}
            targetBrowser={exportBrowser}
            onTargetBrowserChange={setExportBrowser}
          />
        )}
      </main>

      {/* Floating Typist In-Page HUD */}
      {settings.floatingHudEnabled && (
        <TypingHUD
          progress={typingProgress}
          onPauseToggle={handlePauseToggle}
          onCancel={handleCancelTyping}
          onTriggerMistake={() => activeSession?.triggerManualMistake()}
          mistakeShortcut={settings.shortcuts?.triggerMistake || 'Alt+M'}
        />
      )}

      {/* Extension Browser Action Popup Preview */}
      <PopupEmulatorModal
        isOpen={isPopupPreviewOpen}
        onClose={() => setIsPopupPreviewOpen(false)}
        snippets={snippets}
        settings={settings}
        onTriggerSnippet={(snip) => {
          setIsPopupPreviewOpen(false);
          requestAutoType(snip.content, snip.title, snip.id);
        }}
        onTriggerClipboard={() => {
          setIsPopupPreviewOpen(false);
          void requestClipboardAutoType();
        }}
        onOpenSettings={() => {
          setActiveTab('config');
        }}
      />

      {/* In-Page Quick Snippet Command Palette Modal */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        snippets={snippets}
        shortcutLabel={settings.shortcuts?.openSnippetPicker || 'Alt+K'}
        onSelectSnippet={(snip) => {
          setIsCommandPaletteOpen(false);
          requestAutoType(snip.content, snip.title, snip.id);
        }}
      />
    </div>
  );
}
