"use client";

import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import { EditorContent } from "@tiptap/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useNoteEditor } from "@/hooks/useNoteEditor";
import { TextMenu } from "./TextMenu";
import { BacklinksPanel } from "./BacklinksPanel";
import { WikiLinkList } from "./WikiLinkList";
import {
  setWikiLinkListComponent,
  setGetNoteTitles,
  WikiLinkSuggestionItem,
} from "@/lib/tiptap/wiki-link-suggestion";
import { extractWikiLinks } from "@/lib/tiptap/wiki-link";

// Register WikiLinkList component for wiki-link suggestions
setWikiLinkListComponent(WikiLinkList);

interface NoteEditorProps {
  noteId: Id<"canvasNodes">;
  onNavigate: (noteId: Id<"canvasNodes">) => void;
}

export function NoteEditor({ noteId, onNavigate }: NoteEditorProps) {
  const note = useQuery(api.canvas.getNodeById, { id: noteId });
  const notes = useQuery(api.canvas.listNotes);
  const updateNode = useMutation(api.canvas.updateNode);
  const createNode = useMutation(api.canvas.createNode);

  // State to track pending link click (for async handling)
  const [pendingLinkTitle, setPendingLinkTitle] = useState<string | null>(null);

  // Query to find note by title (only runs when we have a pending link)
  const linkedNote = useQuery(
    api.canvas.findNoteByTitle,
    pendingLinkTitle ? { title: pendingLinkTitle } : "skip"
  );

  // Extract titles from notes for wiki-link suggestions
  const noteTitles = useMemo<WikiLinkSuggestionItem[]>(() => {
    if (!notes) return [];

    return notes.map((n) => {
      // Extract title - strip HTML tags first, then get first line
      const textContent = n.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const firstLine = textContent.split("\n")[0] || textContent.slice(0, 100);
      const title = firstLine.replace(/^#+\s*/, "").trim().slice(0, 50) || "Untitled";
      return {
        id: n._id,
        title,
      };
    });
  }, [notes]);

  // Update the global getter for note titles
  useEffect(() => {
    setGetNoteTitles(() => noteTitles);
  }, [noteTitles]);

  // Handle the result of finding a note by title
  useEffect(() => {
    if (pendingLinkTitle === null) return;

    const handleNavigation = async () => {
      if (linkedNote !== undefined) {
        // Query completed
        if (linkedNote) {
          // Note exists, navigate to it
          onNavigate(linkedNote._id);
        } else {
          // Note doesn't exist, create it
          const newId = await createNode({
            type: "note",
            content: `# ${pendingLinkTitle}\n\n`,
            x: 0,
            y: 0,
            sourceType: "manual",
          });
          onNavigate(newId);
        }
        setPendingLinkTitle(null);
      }
    };

    handleNavigation();
  }, [linkedNote, pendingLinkTitle, onNavigate, createNode]);

  // Handle wiki-link clicks
  const handleLinkClick = useCallback((title: string) => {
    setPendingLinkTitle(title);
  }, []);

  // Handle content updates - also extract and save outgoing wiki-links
  const handleUpdate = useCallback(
    (content: string) => {
      const outgoingLinks = extractWikiLinks(content);
      updateNode({ id: noteId, content, outgoingLinks });
    },
    [updateNode, noteId]
  );

  // Initialize editor with the hook
  const { editor, setContent } = useNoteEditor({
    initialContent: note?.content || "",
    onUpdate: handleUpdate,
    onLinkClick: handleLinkClick,
  });

  // Update content ONLY when switching to a different note
  // We use a ref to track the previous noteId to avoid resetting on save
  const prevNoteIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (noteId !== prevNoteIdRef.current && note?.content !== undefined) {
      // Switching notes or initial load - update content
      prevNoteIdRef.current = noteId;
      setContent(note.content);
    }
  }, [noteId, note?.content, setContent]);

  // Extract current note title for backlinks query
  const noteTitle = useMemo(() => {
    if (!note?.content) return "";
    const firstLine = note.content.split("\n")[0];
    const cleanLine = firstLine.replace(/<[^>]*>/g, ""); // Remove HTML tags
    return cleanLine.replace(/^#\s*/, "").trim();
  }, [note?.content]);

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Main editor area - scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full flex justify-center">
          <div className="w-full max-w-2xl px-6 py-12 md:px-12">
            <EditorContent editor={editor} className="note-editor" />
            {editor && <TextMenu editor={editor} />}
          </div>
        </div>
      </div>

      {/* Backlinks panel - fixed at bottom */}
      <BacklinksPanel
        noteTitle={noteTitle}
        currentNoteId={noteId}
        onNavigate={onNavigate}
      />
    </div>
  );
}
