"use client";

import { useEffect, useRef } from "react";
import { useEditor } from "@tiptap/react";
import { convertWikiLinksToHTML } from "@/lib/tiptap/wiki-link";
import { setCommandListComponent } from "@/lib/tiptap/slash-commands";
import { ExtensionKit } from "@/lib/tiptap/extension-kit";
import { CommandList } from "@/components/notes/CommandList";

// Register CommandList component for slash commands
setCommandListComponent(CommandList);

interface UseNoteEditorOptions {
  initialContent?: string;
  onUpdate?: (content: string) => void;
  onLinkClick?: (title: string) => void;
  placeholder?: string;
}

export const useNoteEditor = ({
  initialContent = "",
  onUpdate,
  onLinkClick,
  placeholder,
}: UseNoteEditorOptions) => {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialContentRef = useRef(initialContent);
  const onUpdateRef = useRef(onUpdate);
  const onLinkClickRef = useRef(onLinkClick);

  // Keep refs updated
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    onLinkClickRef.current = onLinkClick;
  }, [onLinkClick]);

  const editor = useEditor(
    {
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      autofocus: false,
      onCreate: ({ editor: createdEditor }) => {
        if (initialContentRef.current) {
          const htmlContent = initialContentRef.current.includes("<")
            ? initialContentRef.current
            : convertWikiLinksToHTML(initialContentRef.current);
          createdEditor.commands.setContent(htmlContent);
        }
      },
      extensions: ExtensionKit({
        onLinkClick: (title: string) => {
          onLinkClickRef.current?.(title);
        },
        placeholder,
      }),
      editorProps: {
        attributes: {
          class: "note-editor-content focus:outline-none min-h-[60vh]",
        },
      },
      onUpdate: ({ editor: updatedEditor }) => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          onUpdateRef.current?.(updatedEditor.getHTML());
        }, 500);
      },
    },
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Method to update content externally (e.g., when switching notes)
  const setContent = (content: string) => {
    if (editor) {
      const htmlContent = content.includes("<")
        ? content
        : convertWikiLinksToHTML(content);
      editor.commands.setContent(htmlContent);
    }
  };

  return { editor, setContent };
};
