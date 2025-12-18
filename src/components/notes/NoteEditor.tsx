"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { WikiLink, convertWikiLinksToHTML } from "@/lib/tiptap/wiki-link";
import { SlashCommands, setCommandListComponent } from "@/lib/tiptap/slash-commands";
import { CommandList } from "./CommandList";

// Register CommandList component for slash commands
setCommandListComponent(CommandList);

interface NoteEditorProps {
  noteId: Id<"canvasNodes">;
  onNavigate: (noteId: Id<"canvasNodes">) => void;
}

export function NoteEditor({ noteId, onNavigate }: NoteEditorProps) {
  const note = useQuery(api.canvas.getNodeById, { id: noteId });
  const updateNode = useMutation(api.canvas.updateNode);
  const createNode = useMutation(api.canvas.createNode);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // State to track pending link click (for async handling)
  const [pendingLinkTitle, setPendingLinkTitle] = useState<string | null>(null);
  
  // Query to find note by title (only runs when we have a pending link)
  const linkedNote = useQuery(
    api.canvas.findNoteByTitle,
    pendingLinkTitle ? { title: pendingLinkTitle } : "skip"
  );

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

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: 'Type "/" for commands...',
      }),
      WikiLink.configure({
        onLinkClick: handleLinkClick,
      }),
      SlashCommands,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose dark:prose-invert max-w-none focus:outline-none min-h-[calc(100vh-200px)] p-4",
      },
    },
    onUpdate: ({ editor }) => {
      // Debounced save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        const content = editor.getHTML();
        updateNode({ id: noteId, content });
      }, 500);
    },
  });

  // Reset editor when noteId changes
  useEffect(() => {
    if (editor && note?.content) {
      const htmlContent = note.content.includes("<") 
        ? note.content 
        : convertWikiLinksToHTML(note.content);
      editor.commands.setContent(htmlContent);
    }
  }, [noteId, editor, note?.content]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto py-8">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
