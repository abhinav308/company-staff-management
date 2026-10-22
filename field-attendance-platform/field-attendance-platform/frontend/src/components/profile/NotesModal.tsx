import React, { useEffect, useState } from 'react';
import { 
  ChevronLeft, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  StickyNote, 
  Save, 
  X, 
  AlertTriangle,
  Clock
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { fmtDate } from '../../services/format';
import type { Note } from '../../types';

interface NotesModalProps {
  onClose: () => void;
}

export default function NotesModal({ onClose }: NotesModalProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editing / Creating State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchNotes = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<any>('/me/notes/');
      const items = Array.isArray(res.data) 
        ? res.data 
        : (Array.isArray(res.data?.results) ? res.data.results : []);
      setNotes(items);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  const openNewNote = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setIsEditorOpen(true);
  };

  const openEditNote = (note: Note) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setIsEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Note title is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingNote) {
        await api.put(`/me/notes/${editingNote.id}/`, { title: title.trim(), content: content.trim() });
      } else {
        await api.post('/me/notes/', { title: title.trim(), content: content.trim() });
      }
      setIsEditorOpen(false);
      await fetchNotes();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    try {
      await api.delete(`/me/notes/${id}/`);
      setNotes(prev => prev.filter(n => n.id !== id));
      if (editingNote?.id === id) {
        setIsEditorOpen(false);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // Filter notes by search query
  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center items-end sm:items-center sm:p-4">
      <div className="bg-slate-50 w-full max-w-md h-[95vh] sm:h-[840px] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        
        {/* Sticky Header */}
        <header className="px-4 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={onClose}
              aria-label="Back to Profile"
              className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">My Notes</h2>
              <p className="text-[11px] text-slate-500">Private Work Logs & Reminders</p>
            </div>
          </div>

          <button
            type="button"
            onClick={openNewNote}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            New Note
          </button>
        </header>

        {/* Search Bar */}
        <div className="bg-white px-4 py-2.5 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search in notes..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Loading notes...</p>
            </div>
          )}

          {!loading && filteredNotes.length === 0 && (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
              <StickyNote className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">No Notes Found</h4>
              <p className="text-xs text-slate-400 mt-1">
                {searchQuery ? 'No notes match your search.' : 'Tap "+ New Note" to jot down your field observations.'}
              </p>
            </div>
          )}

          {filteredNotes.map(n => (
            <div
              key={n.id}
              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2 hover:border-slate-300 transition-all cursor-pointer"
              onClick={() => openEditNote(n)}
            >
              <div className="flex items-start justify-between">
                <h4 className="font-bold text-sm text-slate-900 leading-snug">
                  {n.title}
                </h4>
                <div className="flex items-center gap-1 -mr-1">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); openEditNote(n); }}
                    className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg"
                    title="Edit Note"
                    aria-label="Edit Note"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                    title="Delete Note"
                    aria-label="Delete Note"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {n.content && (
                <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-3">
                  {n.content}
                </p>
              )}

              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                <Clock className="w-3 h-3" />
                <span>Last updated {fmtDate(n.updated_at || n.created_at)}</span>
              </div>
            </div>
          ))}

        </div>

        {/* Note Editor Drawer / Modal */}
        {isEditorOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-end sm:items-center sm:p-4 animate-in fade-in duration-150">
            <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-base">
                  {editingNote ? 'Edit Note' : 'Create New Note'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="note-title">
                    Title *
                  </label>
                  <input
                    id="note-title"
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Substation maintenance checklist"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="note-content">
                    Note Details
                  </label>
                  <textarea
                    id="note-content"
                    rows={6}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Write detailed notes, thoughts, tasks..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 resize-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditorOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Note'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
