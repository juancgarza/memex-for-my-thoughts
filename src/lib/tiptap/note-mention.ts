"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { SuggestionOptions } from "@tiptap/suggestion";

export interface NoteMentionOptions {
  HTMLAttributes: Record<string, unknown>;
  renderLabel: (props: { options: NoteMentionOptions; node: ProseMirrorNode }) => string;
  suggestion: Omit<SuggestionOptions, "editor">;
}

export const NoteMentionPluginKey = new PluginKey("noteMention");

export const NoteMention = Node.create<NoteMentionOptions>({
  name: "noteMention",

  addOptions() {
    return {
      HTMLAttributes: {},
      renderLabel({ node }) {
        return `@${node.attrs.label ?? node.attrs.id}`;
      },
      suggestion: {
        char: "@",
        pluginKey: NoteMentionPluginKey,
        command: ({ editor, range, props }) => {
          // Increase range.to by one when the next node is of type "text"
          // and starts with a space character
          const nodeAfter = editor.view.state.selection.$to.nodeAfter;
          const overrideSpace = nodeAfter?.text?.startsWith(" ");

          if (overrideSpace) {
            range.to += 1;
          }

          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: this.name,
                attrs: props,
              },
              {
                type: "text",
                text: " ",
              },
            ])
            .run();

          window.getSelection()?.collapseToEnd();
        },
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          const type = state.schema.nodes[this.name];
          const allow = !!$from.parent.type.contentMatch.matchType(type);

          return allow;
        },
      },
    };
  },

  group: "inline",

  inline: true,

  selectable: false,

  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-id"),
        renderHTML: (attributes) => {
          if (!attributes.id) {
            return {};
          }

          return {
            "data-id": attributes.id,
          };
        },
      },

      label: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-label"),
        renderHTML: (attributes) => {
          if (!attributes.label) {
            return {};
          }

          return {
            "data-label": attributes.label,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `span[data-type="${this.name}"]`,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(
        { "data-type": this.name },
        this.options.HTMLAttributes,
        HTMLAttributes,
        {
          class:
            "note-mention inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-primary/20 text-primary font-medium text-sm cursor-pointer hover:bg-primary/30 transition-colors",
        }
      ),
      this.options.renderLabel({
        options: this.options,
        node,
      }),
    ];
  },

  renderText({ node }) {
    return this.options.renderLabel({
      options: this.options,
      node,
    });
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          let isMention = false;
          const { selection } = state;
          const { empty, anchor } = selection;

          if (!empty) {
            return false;
          }

          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              isMention = true;
              tr.insertText(
                this.options.suggestion.char || "",
                pos,
                pos + node.nodeSize
              );

              return false;
            }
          });

          return isMention;
        }),
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

// Helper to extract note mentions from editor content
export function extractNoteMentions(
  content: string
): Array<{ id: string; label: string }> {
  const mentions: Array<{ id: string; label: string }> = [];

  // Extract from HTML data attributes
  const idRegex = /data-id="([^"]+)"/g;
  const labelRegex = /data-label="([^"]+)"/g;

  const ids: string[] = [];
  const labels: string[] = [];

  let match;
  while ((match = idRegex.exec(content)) !== null) {
    ids.push(match[1]);
  }
  while ((match = labelRegex.exec(content)) !== null) {
    labels.push(match[1]);
  }

  for (let i = 0; i < ids.length; i++) {
    mentions.push({
      id: ids[i],
      label: labels[i] || ids[i],
    });
  }

  return mentions;
}

// Extract plain text from HTML content (for sending to AI)
export function extractPlainTextWithMentions(html: string): string {
  // Replace mention spans with @label format
  let text = html.replace(
    /<span[^>]*data-type="noteMention"[^>]*data-label="([^"]*)"[^>]*>[^<]*<\/span>/g,
    "@$1"
  );

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  return text.trim();
}
