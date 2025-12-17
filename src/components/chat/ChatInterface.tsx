"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

interface ChatInterfaceProps {
  conversationId: Id<"conversations">;
  onAddToCanvas?: (content: string) => void;
}

export function ChatInterface({
  conversationId,
  onAddToCanvas,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const storedMessages = useQuery(api.messages.list, { conversationId });
  const sendMessageToDb = useMutation(api.messages.send);
  const updateTitle = useMutation(api.conversations.updateTitle);
  const embedMessage = useAction(api.embeddings.embedMessage);

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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isReady) return;

    const currentInput = input;
    setInput("");

    // Save user message to Convex
    const messageId = await sendMessageToDb({
      conversationId,
      role: "user",
      content: currentInput,
    });

    // Embed the user message
    embedMessage({
      messageId,
      content: currentInput,
    }).catch(console.error);

    // Update title if first message
    if (!storedMessages || storedMessages.length === 0) {
      const title =
        currentInput.slice(0, 50) + (currentInput.length > 50 ? "..." : "");
      await updateTitle({ id: conversationId, title });
    }

    // Send to AI
    sendMessage({ text: currentInput });
  };

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
            Start a conversation...
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
                {/* Render message content */}
                <div className="whitespace-pre-wrap text-sm md:text-base">{text}</div>
              </div>

              {/* Add to canvas button - below message for assistant */}
              {onAddToCanvas && text && isAssistant && (
                <button
                  onClick={() => onAddToCanvas(text)}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs md:text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors active:scale-95"
                  title="Add to canvas"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add to Canvas</span>
                </button>
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

      {/* Input Form */}
      <form onSubmit={onSubmit} className="p-3 md:p-4 border-t border-border bg-background">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 bg-card border border-input rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors disabled:opacity-50 text-base"
          />

          {isLoading ? (
            <button
              type="button"
              onClick={stop}
              className="px-4 md:px-6 py-3 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl font-medium transition-colors active:scale-95"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 md:px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-colors active:scale-95"
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
      </form>
    </div>
  );
}
