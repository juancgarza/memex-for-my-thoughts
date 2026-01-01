"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { Plus, Copy, Check, Trash2 } from "lucide-react";
import { EditorContent } from "@tiptap/react";
import { useChatEditor } from "@/hooks/useChatEditor";
import { MarkdownMessage } from "./MarkdownMessage";
import {
  extractPlainTextWithMentions,
  extractNoteMentions,
} from "@/lib/tiptap/note-mention";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MODELS, DEFAULT_MODEL, type ModelId } from "@/lib/models";

interface ChatInterfaceProps {
  conversationId: Id<"conversations">;
  onAddToCanvas?: (content: string) => void;
}

export function ChatInterface({
  conversationId,
  onAddToCanvas,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const storedMessages = useQuery(api.messages.list, { conversationId });
  const notes = useQuery(api.canvas.listNotes);
  const sendMessageToDb = useMutation(api.messages.send);
  const deleteMessage = useMutation(api.messages.remove);
  const updateTitle = useMutation(api.conversations.updateTitle);
  const embedMessage = useAction(api.embeddings.embedMessage);
  const findRelated = useAction(api.embeddings.findRelated);

  const { messages, sendMessage, status, stop, error, setMessages, regenerate } =
    useChat({
      id: conversationId,
      transport: new DefaultChatTransport({
        api: "/api/chat",
      }),
      onFinish: async ({ message }) => {
        // Save assistant message to Convex
        const messageId = await sendMessageToDb({
          conversationId,
          role: "assistant",
          content: message.parts
            .filter(
              (p): p is { type: "text"; text: string } => p.type === "text",
            )
            .map((p) => p.text)
            .join(""),
        });

        // Embed the message for semantic search
        const content = message.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");

        if (content) {
          embedMessage({
            messageId,
            content,
          }).catch(console.error);
        }
      },
      onError: (err) => {
        console.error("Chat error:", err);
      },
    });

  const isLoading = status === "streaming" || status === "submitted";
  const isReady = status === "ready";

  // Extract note titles for @mention suggestions (first line only)
  const noteTitles = useMemo(() => {
    if (!notes) return [];
    return notes.map((n) => {
      // Strip HTML tags first, then get first line
      const textContent = n.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const firstLine = textContent.split("\n")[0];
      // Remove markdown heading prefix
      const title = firstLine.replace(/^#\s*/, "").trim().slice(0, 50) || "Untitled";
      return {
        id: n._id,
        label: title,
      };
    });
  }, [notes]);

  // Handle message submission with note context (manual @mentions + automatic RAG)
  const handleSubmit = useCallback(
    async (text: string, mentions: Array<{ id: string; label: string }>) => {
      if (!text.trim() || !isReady) return;

      // Build context from manually mentioned notes
      const mentionedNoteContents: string[] = [];
      const mentionedNoteIds = new Set<string>();
      
      if (mentions.length > 0 && notes) {
        mentions.forEach((mention) => {
          const note = notes.find((n) => n._id === mention.id);
          if (note) {
            mentionedNoteContents.push(`[Note: ${mention.label}]\n${note.content}`);
            mentionedNoteIds.add(mention.id);
          }
        });
      }

      // Auto-RAG: Find related notes if no explicit mentions (or in addition to them)
      let ragNoteContents: string[] = [];
      try {
        const related = await findRelated({ query: text, limit: 3 });
        // Only include notes (not messages) for RAG context
        // Filter out notes that were already explicitly mentioned
        const relevantNotes = related.nodes
          .filter((n): n is NonNullable<typeof n> => n !== null)
          .filter((n) => !mentionedNoteIds.has(n._id))
          .filter((n) => n.score > 0.3); // Only include if reasonably relevant
        
        if (relevantNotes.length > 0) {
          ragNoteContents = relevantNotes.map((n) => {
            const title = n.content.split('\n')[0].replace(/^#\s*/, '').slice(0, 50) || 'Untitled';
            return `[Related Note (${Math.round(n.score * 100)}% match): ${title}]\n${n.content.slice(0, 500)}${n.content.length > 500 ? '...' : ''}`;
          });
        }
      } catch (err) {
        console.error("RAG search failed:", err);
      }

      // Combine all context
      let messageWithContext = text;
      const allContext = [...mentionedNoteContents, ...ragNoteContents];
      
      if (allContext.length > 0) {
        const contextLabel = mentionedNoteContents.length > 0 && ragNoteContents.length > 0
          ? "Referenced & Related Notes"
          : mentionedNoteContents.length > 0
          ? "Referenced Notes"
          : "Related Notes (auto-retrieved)";
        messageWithContext = `${text}\n\n---\n${contextLabel}:\n${allContext.join("\n\n")}`;
      }

      // Save user message to Convex (just the text, not the context)
      const messageId = await sendMessageToDb({
        conversationId,
        role: "user",
        content: text,
      });

      // Embed the user message
      embedMessage({
        messageId,
        content: text,
      }).catch(console.error);

      // Update title if first message
      if (!storedMessages || storedMessages.length === 0) {
        const title = text.slice(0, 50) + (text.length > 50 ? "..." : "");
        await updateTitle({ id: conversationId, title });
      }

      // Send to AI with context
      sendMessage({ text: messageWithContext }, {
        body: { model: selectedModel },
      });
    },
    [
      isReady,
      notes,
      findRelated,
      sendMessageToDb,
      conversationId,
      embedMessage,
      storedMessages,
      updateTitle,
      sendMessage,
      selectedModel,
    ]
  );

  // Initialize TipTap chat editor
  const { editor, isEmpty } = useChatEditor({
    onSubmit: handleSubmit,
    getNoteTitles: () => noteTitles,
    placeholder: "Message... Use @ to mention notes",
    disabled: isLoading,
  });

  // Sync stored messages to useChat when they load
  useEffect(() => {
    if (storedMessages && storedMessages.length > 0 && messages.length === 0) {
      setMessages(
        storedMessages.map((m: { _id: string; role: string; content: string }) => ({
          id: m._id,
          role: m.role as "user" | "assistant",
          parts: [{ type: "text" as const, text: m.content }],
        })),
      );
    }
  }, [storedMessages, messages.length, setMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Helper to extract text content from message parts
  const getMessageText = (message: (typeof messages)[0]) => {
    return message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  };

  // Copy message to clipboard
  const handleCopyMessage = useCallback(async (messageId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  // Delete message from conversation
  const handleDeleteMessage = useCallback(async (messageId: string) => {
    try {
      await deleteMessage({ id: messageId as Id<"messages"> });
      // Remove from local state as well
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  }, [deleteMessage, setMessages]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Error Banner */}
      {error && (
        <div className="px-4 py-2 bg-destructive/20 border-b border-destructive/50 text-destructive text-sm flex items-center justify-between">
          <span>Something went wrong. Please try again.</span>
          <button
            onClick={() => regenerate()}
            className="text-destructive hover:text-destructive/80 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Start a conversation... Use @ to reference your notes
          </div>
        )}
        {messages.map((message) => {
          const text = getMessageText(message);
          const isAssistant = message.role === "assistant";
          return (
            <div
              key={message.id}
              className={`flex flex-col ${
                message.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[85%] md:max-w-[80%] px-4 py-3 rounded-2xl ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-card-foreground border border-border"
                }`}
              >
                {/* Render message content - markdown for assistant, plain for user */}
                {message.role === "assistant" ? (
                  <MarkdownMessage content={text} className="text-sm md:text-base" />
                ) : (
                  <div className="whitespace-pre-wrap text-sm md:text-base">{text}</div>
                )}
              </div>

              {/* Action buttons - below message */}
              {text && (
                <div className={`mt-2 flex items-center gap-1 ${message.role === "user" ? "justify-end" : ""}`}>
                  <button
                    onClick={() => handleCopyMessage(message.id, text)}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors active:scale-95"
                    title="Copy message"
                  >
                    {copiedMessageId === message.id ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {onAddToCanvas && isAssistant && (
                    <button
                      onClick={() => onAddToCanvas(text)}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors active:scale-95"
                      title="Add to canvas"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteMessage(message.id)}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors active:scale-95"
                    title="Delete message"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Streaming indicator */}
        {status === "submitted" && (
          <div className="flex justify-start">
            <div className="bg-card text-card-foreground border border-border px-4 py-3 rounded-2xl">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                <div
                  className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                />
                <div
                  className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* TipTap Input */}
      <div className="p-3 md:p-4 border-t border-border bg-background">
        {/* Model selector - above input on mobile, inline on desktop */}
        <div className="flex items-center justify-between mb-2 md:hidden">
          <span className="text-xs text-muted-foreground">Model:</span>
          <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v as ModelId)}>
            <SelectTrigger className="w-auto h-7 text-xs gap-1 px-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Recommended</SelectLabel>
                {MODELS.filter(m => m.category === "recommended").map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Anthropic</SelectLabel>
                {MODELS.filter(m => m.category === "anthropic").map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>OpenAI</SelectLabel>
                {MODELS.filter(m => m.category === "openai").map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <div
            className={`flex-1 bg-card border border-input rounded-xl text-foreground focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent transition-colors ${
              isLoading ? "opacity-50" : ""
            }`}
          >
            <EditorContent editor={editor} />
          </div>

          {/* Desktop model selector */}
          <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v as ModelId)}>
            <SelectTrigger className="hidden md:flex w-[160px] h-9 text-xs self-end">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Recommended</SelectLabel>
                {MODELS.filter(m => m.category === "recommended").map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Anthropic</SelectLabel>
                {MODELS.filter(m => m.category === "anthropic").map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>OpenAI</SelectLabel>
                {MODELS.filter(m => m.category === "openai").map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {isLoading ? (
            <button
              type="button"
              onClick={stop}
              className="px-4 md:px-6 py-3 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl font-medium transition-colors active:scale-95 self-end"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (editor && !isEmpty()) {
                  const html = editor.getHTML();
                  const text = extractPlainTextWithMentions(html);
                  const mentions = extractNoteMentions(html);
                  handleSubmit(text, mentions);
                  editor.commands.clearContent();
                }
              }}
              disabled={isEmpty()}
              className="px-4 md:px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-colors active:scale-95 self-end"
            >
              Send
            </button>
          )}
        </div>

        {/* Regenerate button */}
        {messages.length > 0 &&
          messages[messages.length - 1]?.role === "assistant" &&
          isReady && (
            <button
              type="button"
              onClick={() => regenerate()}
              className="mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors active:opacity-70"
            >
              Regenerate response
            </button>
          )}
      </div>
    </div>
  );
}
