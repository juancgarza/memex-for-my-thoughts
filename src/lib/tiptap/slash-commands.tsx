"use client";

import { Extension, Editor, Range } from "@tiptap/core";
import Suggestion, { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { Instance, Props } from "tippy.js";

export interface CommandItem {
  title: string;
  description: string;
  icon: string;
  command: ({ editor, range }: { editor: Editor; range: Range }) => void;
}

export const getSuggestionItems = ({ query }: { query: string }): CommandItem[] => {
  const items: CommandItem[] = [
    {
      title: "Text",
      description: "Plain paragraph text",
      icon: "¶",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setParagraph().run();
      },
    },
    {
      title: "Heading 1",
      description: "Large section heading",
      icon: "H1",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
      },
    },
    {
      title: "Heading 2",
      description: "Medium section heading",
      icon: "H2",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
      },
    },
    {
      title: "Heading 3",
      description: "Small section heading",
      icon: "H3",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
      },
    },
    {
      title: "Bullet List",
      description: "Create a bullet list",
      icon: "•",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: "Numbered List",
      description: "Create a numbered list",
      icon: "1.",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: "Quote",
      description: "Add a blockquote",
      icon: "❝",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setBlockquote().run();
      },
    },
    {
      title: "Code Block",
      description: "Add a code block",
      icon: "</>",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setCodeBlock().run();
      },
    },
    {
      title: "Divider",
      description: "Add a horizontal divider",
      icon: "—",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run();
      },
    },
  ];

  return items.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase())
  );
};

// Import CommandList dynamically to avoid circular deps
let CommandListComponent: React.ComponentType<any> | null = null;

export const setCommandListComponent = (component: React.ComponentType<any>) => {
  CommandListComponent = component;
};

export const renderSuggestion = () => {
  let component: ReactRenderer | null = null;
  let popup: Instance<Props>[] | null = null;

  return {
    onStart: (props: SuggestionProps<CommandItem>) => {
      if (!CommandListComponent) {
        console.error("CommandList component not set");
        return;
      }

      component = new ReactRenderer(CommandListComponent, {
        props,
        editor: props.editor,
      });

      if (!props.clientRect) return;

      popup = tippy("body", {
        getReferenceClientRect: props.clientRect as () => DOMRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
      });
    },

    onUpdate(props: SuggestionProps<CommandItem>) {
      component?.updateProps(props);

      if (!props.clientRect) return;

      popup?.[0]?.setProps({
        getReferenceClientRect: props.clientRect as () => DOMRect,
      });
    },

    onKeyDown(props: SuggestionKeyDownProps) {
      if (props.event.key === "Escape") {
        popup?.[0]?.hide();
        return true;
      }

      return (component?.ref as any)?.onKeyDown(props) ?? false;
    },

    onExit() {
      popup?.[0]?.destroy();
      component?.destroy();
    },
  };
};

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: CommandItem }) => {
          props.command({ editor, range });
        },
        items: getSuggestionItems,
        render: renderSuggestion,
        // Allow slash commands at start of line or after whitespace
        allowSpaces: false,
        startOfLine: false,
        // Allow in empty documents
        allow: ({ editor, state, range }: { editor: Editor; state: any; range: Range }) => {
          // Get the text before the cursor in the current block
          const $from = state.doc.resolve(range.from);
          const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
          
          // Allow if we're at start of block or after whitespace
          const isAtStart = textBefore === "" || textBefore === "/";
          const isAfterWhitespace = /\s\/$/.test(textBefore);
          
          return isAtStart || isAfterWhitespace;
        },
      },
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
