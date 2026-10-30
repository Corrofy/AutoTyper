/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Tag,
  Copy,
  Trash2,
  Edit2,
  Play,
  Upload,
  Download,
  Check,
  X,
  FileCode,
  Mail,
  FormInput,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  Keyboard,
  Hash,
} from 'lucide-react';
import { Snippet } from '../types/extension.ts';
import { ShortcutRecorder } from './ShortcutRecorder.tsx';

interface SnippetsTabProps {
  snippets: Snippet[];
  onUpdateSnippets: (snippets: Snippet[]) => void;
  onTestSnippet: (snippet: Snippet) => void;
}

export const SnippetsTab: React.FC<SnippetsTabProps> = ({
  snippets,
  onUpdateSnippets,
  onTestSnippet,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string>('all');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form fields for editing/creating snippet
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<Snippet['category']>('email');
  const [formContent, setFormContent] = useState('');
  const [formShortcutTrigger, setFormShortcutTrigger] = useState('');
  const [formKeyboardShortcut, setFormKeyboardShortcut] = useState<string | undefined>(undefined);
  const [formTags, setFormTags] = useState('');
  const [formDescription, setFormDescription] = useState('');

  // Extract all unique tags across snippets
  const allTags = useMemo(() => {
    const tagCountMap: Record<string, number> = {};
    snippets.forEach((s) => {
      s.tags.forEach((t) => {
        const clean = t.trim().toLowerCase();
        if (clean) tagCountMap[clean] = (tagCountMap[clean] || 0) + 1;
      });
    });
    return Object.entries(tagCountMap).sort((a, b) => b[1] - a[1]);
  }, [snippets]);

  const openCreateModal = () => {
    setEditingSnippet(null);
    setFormTitle('');
    setFormCategory('email');
    setFormContent('');
    setFormShortcutTrigger(':');
    setFormKeyboardShortcut(undefined);
    setFormTags('work, template');
    setFormDescription('');
    setIsEditorOpen(true);
  };

  const openEditModal = (snippet: Snippet) => {
    setEditingSnippet(snippet);
    setFormTitle(snippet.title);
    setFormCategory(snippet.category);
    setFormContent(snippet.content);
    setFormShortcutTrigger(snippet.shortcutTrigger || '');
    setFormKeyboardShortcut(snippet.keyboardShortcut);
    setFormTags(snippet.tags.join(', '));
    setFormDescription(snippet.description || '');
    setIsEditorOpen(true);
  };

  const handleSaveSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) return;

    const tagsArray = formTags
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
      .filter((t) => t.length > 0);

    if (editingSnippet) {
      // Update existing
      const updated = snippets.map((s) =>
        s.id === editingSnippet.id
          ? {
              ...s,
              title: formTitle.trim(),
              category: formCategory,
              content: formContent,
              shortcutTrigger: formShortcutTrigger.trim() || undefined,
              keyboardShortcut: formKeyboardShortcut,
              tags: tagsArray,
              description: formDescription.trim() || undefined,
            }
          : s
      );
      onUpdateSnippets(updated);
    } else {
      // Create new
      const newSnippet: Snippet = {
        id: 'snip-' + Date.now().toString(36),
        title: formTitle.trim(),
        category: formCategory,
        content: formContent,
        shortcutTrigger: formShortcutTrigger.trim() || undefined,
        keyboardShortcut: formKeyboardShortcut,
        tags: tagsArray,
        description: formDescription.trim() || undefined,
        createdAt: Date.now(),
        useCount: 0,
      };
      onUpdateSnippets([newSnippet, ...snippets]);
    }
    setIsEditorOpen(false);
  };

  const handleDeleteSnippet = (id: string) => {
    if (confirm('Delete this snippet?')) {
      onUpdateSnippets(snippets.filter((s) => s.id !== id));
    }
  };

  const handleDuplicate = (snippet: Snippet) => {
    const duplicated: Snippet = {
      ...snippet,
      id: 'snip-' + Date.now().toString(36),
      title: `${snippet.title} (Copy)`,
      shortcutTrigger: snippet.shortcutTrigger ? `${snippet.shortcutTrigger}2` : undefined,
      keyboardShortcut: undefined, // require distinct shortcut
      createdAt: Date.now(),
      useCount: 0,
    };
    onUpdateSnippets([duplicated, ...snippets]);
  };

  const handleCopyContent = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleInsertTag = (tag: string) => {
    setFormContent((prev) => prev + tag);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(snippets, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = 'autotyper-snippets.json';
    a.click();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          onUpdateSnippets(parsed);
          alert(`Successfully imported ${parsed.length} snippets!`);
        }
      } catch (err) {
        alert('Invalid JSON file format: ' + err);
      }
    };
    reader.readAsText(file);
  };

  // Filter snippets by search query and active tag
  const filteredSnippets = snippets.filter((s) => {
    const matchesTag =
      activeTag === 'all' || s.tags.map((t) => t.toLowerCase()).includes(activeTag.toLowerCase());

    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesTag;

    const matchesName = s.title.toLowerCase().includes(q);
    const matchesContent = s.content.toLowerCase().includes(q);
    const matchesTrigger = s.shortcutTrigger && s.shortcutTrigger.toLowerCase().includes(q);
    const matchesTags = s.tags.some((t) => t.toLowerCase().includes(q.replace(/^#/, '')));

    return matchesTag && (matchesName || matchesContent || matchesTrigger || matchesTags);
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'code':
        return <FileCode className="w-3.5 h-3.5 text-emerald-400" />;
      case 'email':
        return <Mail className="w-3.5 h-3.5 text-sky-400" />;
      case 'forms':
        return <FormInput className="w-3.5 h-3.5 text-amber-400" />;
      case 'chat':
        return <MessageSquare className="w-3.5 h-3.5 text-purple-400" />;
      case 'testing':
        return <ShieldAlert className="w-3.5 h-3.5 text-red-400" />;
      default:
        return <Tag className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Snippet Management System
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Create, edit, organize with tags, and bind custom keyboard combinations to activate auto-typing.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg transition-colors flex items-center gap-1.5 border border-slate-700">
            <Upload className="w-3.5 h-3.5" />
            <span>Import JSON</span>
            <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
          </label>

          <button
            onClick={handleExportJSON}
            className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg transition-colors flex items-center gap-1.5 border border-slate-700"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            onClick={openCreateModal}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm shadow-indigo-600/30"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Snippet</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mt-6">
        {/* Dynamic Tag Filter Buttons (Segmented Controls) */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTag('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTag === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            All Snippets ({snippets.length})
          </button>

          {allTags.slice(0, 8).map(([tag, count]) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1 ${
                activeTag === tag
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <span>#{tag}</span>
              <span className="text-[10px] opacity-75 font-mono">({count})</span>
            </button>
          ))}
        </div>

        {/* Live Search Input */}
        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, tag (#email), or trigger..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Snippet Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {filteredSnippets.length === 0 ? (
          <div className="col-span-full text-center py-16 bg-slate-900/50 border border-slate-800 rounded-xl p-8">
            <Tag className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-300">No snippets found</h3>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting your search query or tag filter, or click &quot;Add New Snippet&quot;.
            </p>
          </div>
        ) : (
          filteredSnippets.map((snippet) => (
            <div
              key={snippet.id}
              className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between transition-all group shadow-sm hover:shadow-md"
            >
              <div>
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {getCategoryIcon(snippet.category)}
                    <h3 className="text-sm font-semibold text-white truncate" title={snippet.title}>
                      {snippet.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {snippet.keyboardShortcut && (
                      <kbd className="text-[10px] font-mono text-amber-300 bg-amber-950/60 border border-amber-800/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Keyboard className="w-2.5 h-2.5" />
                        {snippet.keyboardShortcut}
                      </kbd>
                    )}
                    {snippet.shortcutTrigger && (
                      <code className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-800/40 px-1.5 py-0.5 rounded">
                        {snippet.shortcutTrigger}
                      </code>
                    )}
                  </div>
                </div>

                {/* Metadata row (Zero-pill discipline: typographic separators) */}
                <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-2 flex-wrap">
                  <span className="capitalize text-slate-500">{snippet.category}</span>
                  {snippet.tags.length > 0 && (
                    <>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-slate-400 flex items-center gap-1">
                        <Hash className="w-3 h-3 text-slate-500" />
                        {snippet.tags.join(', ')}
                      </span>
                    </>
                  )}
                </div>

                {/* Snippet Body Preview */}
                <div className="relative bg-slate-950 border border-slate-800/80 rounded-lg p-2.5 font-mono text-xs text-slate-300 h-24 overflow-hidden mb-3 select-none">
                  <pre className="whitespace-pre-wrap break-words leading-relaxed font-mono">
                    {snippet.content}
                  </pre>
                  <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopyContent(snippet.content, snippet.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                    title="Copy text to clipboard"
                  >
                    {copiedId === snippet.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDuplicate(snippet)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                    title="Duplicate snippet"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => openEditModal(snippet)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                    title="Edit snippet & shortcuts"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteSnippet(snippet.id)}
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                    title="Delete snippet"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => onTestSnippet(snippet)}
                  className="px-3 py-1.5 text-xs font-semibold text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-800/40 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Test Auto-Type</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* CREATE / EDIT MODAL WITH SHORTCUT RECORDER */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setIsEditorOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-white mb-1">
              {editingSnippet ? 'Edit Snippet' : 'Add New Snippet'}
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Customize snippet details, custom tags, and assign an authentic keyboard shortcut combo.
            </p>

            <form onSubmit={handleSaveSnippet} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Snippet Name / Title *</label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Sales Intro Template"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as Snippet['category'])}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 capitalize"
                  >
                    <option value="email">Email</option>
                    <option value="code">Code</option>
                    <option value="forms">Forms</option>
                    <option value="chat">Chat</option>
                    <option value="testing">Testing</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>

              {/* Tags and Shortcut Trigger */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                    placeholder="proposal, outreach, follow-up"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300">
                    Shortcut Trigger Prefix (e.g. :intro)
                  </label>
                  <input
                    type="text"
                    value={formShortcutTrigger}
                    onChange={(e) => setFormShortcutTrigger(e.target.value)}
                    placeholder=":intro"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Dedicated Custom Keyboard Shortcut Combination Recorder */}
              <div className="p-3 bg-slate-950 border border-slate-800/90 rounded-lg">
                <ShortcutRecorder
                  label="Direct Keyboard Shortcut Combination"
                  value={formKeyboardShortcut}
                  onChange={setFormKeyboardShortcut}
                  placeholder="Click to record key combo (e.g. Alt+1, Ctrl+Alt+S)..."
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Pressing this combination anywhere in your browser will instantly auto-type this snippet into the focused field.
                </p>
              </div>

              {/* Snippet Content */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-300">Snippet Content *</label>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span>Dynamic tags:</span>
                    {['{{date}}', '{{time}}', '{{weekday}}', '{{name}}', '{{email}}'].map((tag) => (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => handleInsertTag(tag)}
                        className="bg-slate-800 hover:bg-slate-700 text-indigo-300 px-1.5 py-0.5 rounded font-mono text-[10px]"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  required
                  rows={6}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Enter snippet text here. Type multi-line text or code freely..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-100 font-mono focus:outline-none focus:border-indigo-500 leading-relaxed resize-y"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-300">Description / Usage Notes</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional notes about this snippet"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors shadow-sm shadow-indigo-600/30 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Save Snippet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
