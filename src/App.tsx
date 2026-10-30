/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header.tsx';
import { SimulatorTab } from './components/SimulatorTab.tsx';
import { SnippetsTab } from './components/SnippetsTab.tsx';
import { ConfigTab } from './components/ConfigTab.tsx';
import { ExportTab } from './components/ExportTab.tsx';
import { TypingHUD } from './components/TypingHUD.tsx';
import { PopupEmulatorModal } from './components/PopupEmulatorModal.tsx';
import { CommandPaletteModal } from './components/CommandPaletteModal.tsx';
import { Snippet, AutoTyperSettings, TypingProgressState } from './types/extension.ts';
import { DEFAULT_SNIPPETS, DEFAULT_SETTINGS } from './data/defaultSnippets.ts';
import { AutoTyperSession } from './utils/autoTyperEngine.ts';
import { createExtensionZip } from './utils/extensionGenerator.ts';
import { matchesShortcut } from './utils/shortcutHelper.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'snippets' | 'config' | 'export'>('simulator');
  const [isPopupPreviewOpen, setIsPopupPreviewOpen] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Load and persist snippets
  const [snippets, setSnippets] = useState<Snippet[]>(() => {
    try {
      const saved = localStorage.getItem('autotyper_snippets');
      if (saved) return JSON.parse(saved);
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

  // Global Custom Keyboard Shortcuts Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Emergency Stop
      const stopKey = settings.shortcuts?.stopTyping || 'Escape';
      if ((e.key === 'Escape' || matchesShortcut(e, stopKey)) && activeSession) {
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

      // Do not trigger global navigation shortcuts if typing inside an active input element unless a modifier is pressed
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

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
        setActiveTab('simulator');
        return;
      }

      // 6. Per-Snippet Keyboard Shortcuts (e.g. Alt+1, Alt+2, Ctrl+Alt+S)
      for (const snip of snippets) {
        if (snip.keyboardShortcut && matchesShortcut(e, snip.keyboardShortcut)) {
          e.preventDefault();
          setSelectedSnippetId(snip.id);
          setActiveTab('simulator');
          return;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeSession, settings.shortcuts, settings.stopOnEscape, snippets]);

  // Download Extension Zip
  const handleDownloadZip = async () => {
    try {
      setIsDownloadingZip(true);
      const zipBlob = await createExtensionZip(snippets, settings, 'chrome');
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'autotyper-pro-extension.zip';
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
    setSelectedSnippetId(snippet.id);
    setActiveTab('simulator');
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
          setSelectedSnippetId(snip.id);
          setActiveTab('simulator');
        }}
        onTriggerClipboard={() => {
          setActiveTab('simulator');
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
          setSelectedSnippetId(snip.id);
          setActiveTab('simulator');
        }}
      />
    </div>
  );
}
