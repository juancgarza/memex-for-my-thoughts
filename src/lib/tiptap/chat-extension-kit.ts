"use client";

import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { NoteMention } from "./note-mention";
import { renderNoteMentionSuggestion, NoteMentionItem } from "./note-mention-suggestion";

export interface ChatExtensionKitOptions {
  placeholder?: string;
  onSubmit?: () => void;
  getNoteTitles?: () => NoteMentionItem[];
}

/**
 * Custom extension to handle Enter key for submission
 * and Shift+Enter for new lines
 */
const SubmitOnEnter = Extension.create<{ onSubmit?: () => void }>({
  name: "submitOnEnter",

  addOptions() {
    return {
      onSubmit: undefined,
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        // Check if there's a suggestion popup open
        // If so, let the suggestion handle it
        const { state } = this.editor;
        const { selection } = state;
        
        // If there's selected text or we're in a special state, don't submit
        if (!selection.empty) {
          return false;
        }

        // Call onSubmit callback
        if (this.options.onSubmit) {
          this.options.onSubmit();
          return true;
        }

        return false;
      },
      "Shift-Enter": () => {
        // Insert a hard break (new line)
        return this.editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          () => commands.splitBlock(),
        ]);
      },
    };
  },
});

/**
 * Slim TipTap extension kit for chat input.
 * Features:
 * - @mention for notes with autocomplete
 * - Enter to submit, Shift+Enter for newline
 * - No headings, no slash commands
 * - Minimal formatting
 */
export const ChatExtensionKit = ({
  placeholder = "Message... Use @ to mention notes",
  onSubmit,
  getNoteTitles = () => [],
}: ChatExtensionKitOptions = {}) => {
  return [
    // StarterKit with minimal features (no headings, lists, etc.)
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      bold: false,
      italic: false,
      strike: false,
      code: false,
    }),

    // Placeholder text
    Placeholder.configure({
      placeholder,
    }),

    // Enter to submit
    SubmitOnEnter.configure({
      onSubmit,
    }),

    // @mention for notes
    NoteMention.configure({
      suggestion: {
        items: ({ query }: { query: string }) => {
          const titles = getNoteTitles();
          const queryLower = query.toLowerCase().trim();

          if (!queryLower) {
            return titles.slice(0, 8);
          }

          return titles
            .filter((item) =>
              item.label.toLowerCase().includes(queryLower)
            )
            .slice(0, 8);
        },
        render: renderNoteMentionSuggestion,
      },
    }),
  ];
};

export default ChatExtensionKit;
