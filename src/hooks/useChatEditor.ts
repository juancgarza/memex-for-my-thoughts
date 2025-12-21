"use client";

import { useCallback, useRef } from "react";
import { useEditor } from "@tiptap/react";
import { ChatExtensionKit } from "@/lib/tiptap/chat-extension-kit";
import { NoteMentionItem } from "@/lib/tiptap/note-mention-suggestion";
import {
  extractNoteMentions,
  extractPlainTextWithMentions,
} from "@/lib/tiptap/note-mention";

interface UseChatEditorOptions {
  onSubmit?: (text: string, mentions: Array<{ id: string; label: string }>) => void;
  getNoteTitles?: () => NoteMentionItem[];
  placeholder?: string;
  disabled?: boolean;
}

export const useChatEditor = ({
  onSubmit,
  getNoteTitles = () => [],
  placeholder,
  disabled = false,
}: UseChatEditorOptions) => {
  const onSubmitRef = useRef(onSubmit);
  const getNoteTitlesRef = useRef(getNoteTitles);

  // Keep refs updated
  onSubmitRef.current = onSubmit;
  getNoteTitlesRef.current = getNoteTitles;

  const handleSubmit = useCallback(() => {
    if (!editor) return;

    const html = editor.getHTML();
    const text = extractPlainTextWithMentions(html);
    const mentions = extractNoteMentions(html);

    if (text.trim()) {
      onSubmitRef.current?.(text, mentions);
      editor.commands.clearContent();
    }
  }, []);

  const editor = useEditor(
    {
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      autofocus: false,
      editable: !disabled,
      extensions: ChatExtensionKit({
        placeholder,
        onSubmit: handleSubmit,
        getNoteTitles: () => getNoteTitlesRef.current(),
      }),
      editorProps: {
        attributes: {
          class:
            "chat-editor-content focus:outline-none min-h-[44px] max-h-[200px] overflow-y-auto px-4 py-3 text-base",
        },
      },
    },
    []
  );

  // Method to clear the editor
  const clearContent = useCallback(() => {
    editor?.commands.clearContent();
  }, [editor]);

  // Method to focus the editor
  const focus = useCallback(() => {
    editor?.commands.focus();
  }, [editor]);

  // Get current content as plain text
  const getText = useCallback(() => {
    if (!editor) return "";
    return extractPlainTextWithMentions(editor.getHTML());
  }, [editor]);

  // Get mentioned notes
  const getMentions = useCallback(() => {
    if (!editor) return [];
    return extractNoteMentions(editor.getHTML());
  }, [editor]);

  // Check if editor is empty
  const isEmpty = useCallback(() => {
    if (!editor) return true;
    return editor.isEmpty;
  }, [editor]);

  return {
    editor,
    clearContent,
    focus,
    getText,
    getMentions,
    isEmpty,
  };
};
