"use client";

import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import CharacterCount from "@tiptap/extension-character-count";
import { WikiLink } from "./wiki-link";
import { SlashCommands } from "./slash-commands";

interface ExtensionKitOptions {
  onLinkClick?: (title: string) => void;
  placeholder?: string;
  characterLimit?: number;
}

/**
 * Centralized TipTap extension configuration for the note editor.
 * Following the pattern from tiptap-templates/next-block-editor-app.
 */
export const ExtensionKit = ({
  onLinkClick,
  placeholder = 'Type "/" for commands...',
  characterLimit = 50000,
}: ExtensionKitOptions = {}) => [
  // StarterKit with customizations - disable features we override
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    horizontalRule: false, // We provide custom one without input rules
    bold: false, // We provide custom one without input rules
    italic: false, // We provide custom one without input rules
  }),

  // HorizontalRule without input rules (prevents *** auto-conversion)
  HorizontalRule.extend({
    addInputRules() {
      return [];
    },
  }),

  // Bold without input rules (prevents **text** auto-conversion)
  Bold.extend({
    addInputRules() {
      return [];
    },
  }),

  // Italic without input rules (prevents *text* auto-conversion)
  Italic.extend({
    addInputRules() {
      return [];
    },
  }),

  // Placeholder text
  Placeholder.configure({
    placeholder,
  }),

  // Character count with limit
  CharacterCount.configure({
    limit: characterLimit,
  }),

  // Wiki-links [[link]] support
  WikiLink.configure({
    onLinkClick,
  }),

  // Slash commands
  SlashCommands,
];

export default ExtensionKit;
