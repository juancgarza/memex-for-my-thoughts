"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { Instance, Props } from "tippy.js";

export interface NoteMentionItem {
  id: string;
  label: string;
}

interface NoteMentionListProps {
  items: NoteMentionItem[];
  command: (item: NoteMentionItem) => void;
}

interface NoteMentionListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

const NoteMentionList = forwardRef<NoteMentionListRef, NoteMentionListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    };

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) =>
            prev <= 0 ? items.length - 1 : prev - 1
          );
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) =>
            prev >= items.length - 1 ? 0 : prev + 1
          );
          return true;
        }

        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-2 text-sm text-muted-foreground">
          No notes found
        </div>
      );
    }

    return (
      <div className="bg-popover border border-border rounded-lg shadow-lg overflow-hidden min-w-[200px] max-w-[300px]">
        {items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectItem(index)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
              index === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "text-foreground hover:bg-muted"
            }`}
          >
            <span className="text-primary font-medium">@</span>
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    );
  }
);

NoteMentionList.displayName = "NoteMentionList";

export const renderNoteMentionSuggestion = () => {
  let component: ReactRenderer<NoteMentionListRef> | null = null;
  let popup: Instance<Props>[] | null = null;

  return {
    onStart: (props: SuggestionProps<NoteMentionItem>) => {
      component = new ReactRenderer(NoteMentionList, {
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
        placement: "top-start",
        theme: "none",
      });
    },

    onUpdate(props: SuggestionProps<NoteMentionItem>) {
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

      return component?.ref?.onKeyDown(props) ?? false;
    },

    onExit() {
      popup?.[0]?.destroy();
      component?.destroy();
    },
  };
};
