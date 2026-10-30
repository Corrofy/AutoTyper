/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Download,
  FileCode2,
  Copy,
  Check,
  Chrome,
  Compass,
  FolderTree,
  ExternalLink,
  Info,
} from 'lucide-react';
import { Snippet, AutoTyperSettings, TargetBrowser, GeneratedExtensionFile } from '../types/extension.ts';
import { generateExtensionFiles, createExtensionZip } from '../utils/extensionGenerator.ts';

interface ExportTabProps {
  snippets: Snippet[];
  settings: AutoTyperSettings;
  onDownloadZip: () => void;
  isDownloadingZip?: boolean;
}

export const ExportTab: React.FC<ExportTabProps> = ({
  snippets,
  settings,
  onDownloadZip,
  isDownloadingZip = false,
}) => {
  const [targetBrowser, setTargetBrowser] = useState<TargetBrowser>('chrome');
  const [selectedFilePath, setSelectedFilePath] = useState<string>('manifest.json');
  const [copiedCode, setCopiedCode] = useState(false);

  // Generate file list dynamically based on target browser and current user snippets/settings
  const files: GeneratedExtensionFile[] = useMemo(() => {
    return generateExtensionFiles(snippets, settings, targetBrowser);
  }, [snippets, settings, targetBrowser]);

  const activeFile = files.find((f) => f.path === selectedFilePath) || files[0];

  const handleCopyCode = () => {
    if (activeFile) {
      navigator.clipboard.writeText(activeFile.content);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-indigo-400" />
            Cross-Browser Extension Exporter
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Download the ready-to-install browser extension archive pre-configured with your snippets and settings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onDownloadZip}
            disabled={isDownloadingZip}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-md shadow-indigo-600/30"
          >
            <Download className="w-4 h-4" />
            <span>{isDownloadingZip ? 'Packaging Extension...' : 'Download Extension (.zip)'}</span>
          </button>
        </div>
      </div>

      {/* Target Browser Selector Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div
          onClick={() => setTargetBrowser('chrome')}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            targetBrowser === 'chrome'
              ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-sm'
              : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-900/50 flex items-center justify-center text-indigo-400">
              <Chrome className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                Chromium Standard (Chrome, Edge, Brave, Opera)
                {targetBrowser === 'chrome' && (
                  <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded font-mono">
                    Active
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Manifest V3 with Background Service Worker and Clipboard API permissions
              </div>
            </div>
          </div>
        </div>

        <div
          onClick={() => setTargetBrowser('firefox')}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            targetBrowser === 'firefox'
              ? 'bg-indigo-950/40 border-indigo-500 text-white shadow-sm'
              : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-900/50 flex items-center justify-center text-indigo-400">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                Mozilla Firefox (Gecko MV3 / MV2)
                {targetBrowser === 'firefox' && (
                  <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded font-mono">
                    Active
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Includes Gecko Add-on ID and Firefox-compatible background scripts
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Code Inspector & File Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* Left: File Tree Explorer (4 cols) */}
        <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5 text-indigo-400" />
              Generated Extension Package
            </span>
            <span className="text-[11px] text-slate-500 font-mono">{files.length} files</span>
          </div>

          <div className="space-y-1">
            {files.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedFilePath(file.path)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between transition-colors ${
                  activeFile?.path === file.path
                    ? 'bg-indigo-950/80 text-indigo-200 border border-indigo-700/50 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FileCode2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{file.path}</span>
                </div>
                <span className="text-[10px] text-slate-500 uppercase shrink-0 ml-2">
                  {file.language}
                </span>
              </button>
            ))}
          </div>

          {/* Quick info note */}
          <div className="mt-4 p-3 bg-slate-950 border border-slate-800/80 rounded-lg text-[11px] text-slate-400 space-y-1">
            <div className="font-semibold text-slate-300 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-indigo-400" />
              Live Sync
            </div>
            <p>
              These files dynamically incorporate your latest snippets and speed settings. Downloading the ZIP gives you this exact codebase.
            </p>
          </div>
        </div>

        {/* Right: Code Viewer (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
          {/* File toolbar */}
          <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-semibold text-indigo-400">
                {activeFile?.path}
              </span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-400 truncate max-w-sm">
                {activeFile?.description}
              </span>
            </div>

            <button
              onClick={handleCopyCode}
              className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors flex items-center gap-1.5"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          {/* Code body */}
          <div className="p-4 bg-slate-950/70 font-mono text-xs text-slate-300 overflow-x-auto max-h-[500px] leading-relaxed">
            <pre className="whitespace-pre">
              <code>{activeFile?.content}</code>
            </pre>
          </div>
        </div>
      </div>

      {/* Build Directory Banner */}
      <div className="mt-8 p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="text-sm font-bold text-white flex items-center gap-2">
            <span>📦</span>
            Compiled Builds in <code className="text-indigo-400 font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">./build</code>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Build command <code className="text-indigo-300 font-mono">npm run build:extension</code> generates unpacked folders for both browser engines directly in <code className="text-slate-300">./build/chromium/</code> and <code className="text-slate-300">./build/firefox/</code>.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="bg-slate-950 px-2.5 py-1 rounded border border-slate-800 text-indigo-300">npm run build:extension</span>
        </div>
      </div>

      {/* Installation Guide */}
      <div className="mt-8 pt-6 border-t border-slate-800">
        <h2 className="text-base font-bold text-white mb-4">
          How to Load the Extension in 30 Seconds
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Chrome / Edge guide */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-white">
              <Chrome className="w-4 h-4 text-indigo-400" />
              Chrome, Edge, Brave &amp; Opera
            </div>
            <ol className="space-y-2 text-slate-300 list-decimal list-inside leading-relaxed">
              <li>Use the compiled directory <code className="text-indigo-300 bg-slate-950 px-1 py-0.5 rounded font-mono">./build/chromium</code> (or click &quot;Download Extension&quot; above).</li>
              <li>Open your browser and navigate to <code className="text-indigo-300 bg-slate-950 px-1 py-0.5 rounded font-mono">chrome://extensions</code> (or <code className="text-indigo-300 bg-slate-950 px-1 py-0.5 rounded font-mono">edge://extensions</code>).</li>
              <li>Toggle <strong>&quot;Developer mode&quot;</strong> in the top-right corner.</li>
              <li>Click <strong>&quot;Load unpacked&quot;</strong> and select <code className="text-slate-200 font-mono">./build/chromium</code>.</li>
              <li>AutoTyper Pro is now installed and ready to test!</li>
            </ol>
          </div>

          {/* Firefox guide */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-white">
              <Compass className="w-4 h-4 text-indigo-400" />
              Mozilla Firefox
            </div>
            <ol className="space-y-2 text-slate-300 list-decimal list-inside leading-relaxed">
              <li>Use the compiled directory <code className="text-indigo-300 bg-slate-950 px-1 py-0.5 rounded font-mono">./build/firefox</code> (or download with Firefox selected).</li>
              <li>In Firefox address bar, navigate to <code className="text-indigo-300 bg-slate-950 px-1 py-0.5 rounded font-mono">about:debugging#/runtime/this-firefox</code>.</li>
              <li>Under <strong>Temporary Extensions</strong>, click <strong>&quot;Load Temporary Add-on...&quot;</strong>.</li>
              <li>Select the <code className="text-slate-200 font-mono">manifest.json</code> inside <code className="text-indigo-300 font-mono">./build/firefox/</code>.</li>
              <li>AutoTyper Pro is immediately loaded in Firefox!</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
