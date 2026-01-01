"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { FileText, Plus, Trash2, Download, Calendar } from "lucide-react";

interface NotesSidebarProps {
  selectedId: Id<"canvasNodes"> | null;
  onSelect: (id: Id<"canvasNodes">) => void;
  onClose?: () => void;
  onImportClick?: () => void;
  onDailyNoteClick?: () => void;
}

export function NotesSidebar({ selectedId, onSelect, onClose, onImportClick, onDailyNoteClick }: NotesSidebarProps) {
  const notes = useQuery(api.canvas.listNotes);
  const createNode = useMutation(api.canvas.createNode);
  const deleteNode = useMutation(api.canvas.deleteNode);

  const handleNewNote = async () => {
    const id = await createNode({
      type: "note",
      content: "# Untitled\n\nStart writing...",
      x: 0,
      y: 0,
      sourceType: "manual",
    });
    onSelect(id);
    onClose?.();
  };

  const handleDelete = async (id: Id<"canvasNodes">, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNode({ id });
  };

  // Extract title from note content (handles both HTML and markdown)
  const getTitle = (content: string) => {
    // Strip HTML tags first
    const textContent = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    // Get first line
    const firstLine = textContent.split("\n")[0];
    // Remove markdown heading prefix and clean up
    return firstLine.replace(/^#\s*/, "").trim().slice(0, 50) || "Untitled";
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="w-72 md:w-64 bg-card border-r border-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Notes</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onDailyNoteClick}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title="Today's daily note (g d)"
          >
            <Calendar className="w-4 h-4" />
          </button>
          <button
            onClick={onImportClick}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title="Import content"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleNewNote}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title="New note"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto">
        {notes?.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No notes yet. Create one to get started.
          </div>
        )}
        {notes?.map((note) => (
          <div
            key={note._id}
            onClick={() => {
              onSelect(note._id);
              onClose?.();
            }}
            className={`group px-4 py-3 cursor-pointer border-b border-border transition-colors ${
              selectedId === note._id
                ? "bg-muted"
                : "hover:bg-muted/50"
            }`}
          >
            <div className="flex items-start gap-3">
              <FileText className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate text-foreground">
                    {getTitle(note.content)}
                  </span>
                  <button
                    onClick={(e) => handleDelete(note._id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded transition-all"
                    title="Delete note"
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </button>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(note.updatedAt)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
