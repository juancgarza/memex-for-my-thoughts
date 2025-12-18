"use client";

import { Extension, Editor, Range } from "@tiptap/core";
import Suggestion, {
  SuggestionProps,
  SuggestionKeyDownProps,
} from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { Instance, Props } from "tippy.js";
import { PluginKey } from "@tiptap/pm/state";

export interface WikiLinkSuggestionItem {
  id: string;
  title: string;
}

// Component will be set dynamically to avoid circular deps
let WikiLinkListComponent: React.ComponentType<any> | null = null;

export const setWikiLinkListComponent = (
  component: React.ComponentType<any>
) => {
  WikiLinkListComponent = component;
};

// Function to get note titles - will be provided by the component
let getNoteTitles: () => WikiLinkSuggestionItem[] = () => [];

export const setGetNoteTitles = (
  fn: () => WikiLinkSuggestionItem[]
) => {
  getNoteTitles = fn;
};

export const renderWikiLinkSuggestion = () => {
  let component: ReactRenderer | null = null;
  let popup: Instance<Props>[] | null = null;

  return {
    onStart: (props: SuggestionProps<WikiLinkSuggestionItem>) => {
      if (!WikiLinkListComponent) {
        console.error("WikiLinkList component not set");
        return;
      }

      component = new ReactRenderer(WikiLinkListComponent, {
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

    onUpdate(props: SuggestionProps<WikiLinkSuggestionItem>) {
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

export const WikiLinkSuggestion = Extension.create({
  name: "wikiLinkSuggestion",

  addOptions() {
    return {
      suggestion: {
        char: "[[",
        allowSpaces: true,
        startOfLine: false,
        pluginKey: new PluginKey("wikiLinkSuggestion"),
        command: ({
          editor,
          props,
        }: {
          editor: Editor;
          range: Range;
          props: WikiLinkSuggestionItem;
        }) => {
          const { view, state } = editor;
          const { $head, $from } = view.state.selection;

          const end = $from.pos;
          // Get text before cursor in current node
          const textBefore = $head?.nodeBefore?.text || "";
          const bracketIndex = textBefore.lastIndexOf("[[");

          let from: number;
          if (bracketIndex !== -1) {
            // Delete from "[[" to cursor
            from = end - (textBefore.length - bracketIndex);
          } else {
            // Fallback: delete from start of current text node
            from = end - textBefore.length;
          }

          // Delete the [[ and query text, then insert wiki link
          const tr = state.tr.deleteRange(from, end);
          view.dispatch(tr);

          // Insert the wiki link
          editor.chain().focus().insertContent(`[[${props.title}]]`).run();
        },
        items: ({ query }: { query: string }) => {
          const titles = getNoteTitles();
          const queryLower = query.toLowerCase().trim();

          if (!queryLower) {
            // Show all notes when no query
            return titles.slice(0, 10);
          }

          // Filter by query
          return titles
            .filter((item) =>
              item.title.toLowerCase().includes(queryLower)
            )
            .slice(0, 10);
        },
        render: renderWikiLinkSuggestion,
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
