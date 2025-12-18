"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation, useAction } from "convex/react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - tinykeys types issue with package.json exports
import { tinykeys } from "tinykeys";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { MemexCanvas } from "@/components/canvas/MemexCanvas";
import { SemanticSearch } from "@/components/search/SemanticSearch";
import { VoiceRecorder } from "@/components/voice/VoiceRecorder";
import { NotesView } from "@/components/notes/NotesView";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/lib/theme";
import { useServiceWorker, usePWAInstall, useIsStandalone } from "@/lib/pwa";
import {
  Sun,
  Moon,
  MessageSquare,
  LayoutGrid,
  Menu,
  X,
  Download,
  Plus,
  FileText,
} from "lucide-react";

type View = "chat" | "canvas" | "notes";
const VIEWS: View[] = ["chat", "canvas", "notes"];

export default function Home() {
  const [view, setView] = useState<View>("chat");
  const [selectedConversation, setSelectedConversation] =
    useState<Id<"conversations"> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // PWA hooks
  useServiceWorker();
  const { canInstall, install } = usePWAInstall();
  const isStandalone = useIsStandalone();

  const createNode = useMutation(api.canvas.createNode);
  const createEdge = useMutation(api.canvas.createEdge);
  const createConversation = useMutation(api.conversations.create);
  const embedCanvasNode = useAction(api.embeddings.embedCanvasNode);
  const findRelated = useAction(api.embeddings.findRelated);

  const handleNewChat = useCallback(async () => {
    const id = await createConversation({});
    setSelectedConversation(id);
    setView("chat");
  }, [createConversation]);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close sidebar when view changes on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [view, isMobile]);

  // Keyboard shortcuts (vim-style with 'g' leader key)
  useEffect(() => {
    const unsubscribe = tinykeys(window, {
      // g then c = chat, g then v = canvas, g then n = notes
      "g c": () => setView("chat"),
      "g v": () => setView("canvas"),
      "g n": () => setView("notes"),
      // Navigate between views: g h (prev) and g l (next) - vim style h/l
      "g h": () => {
        setView(prev => {
          const currentIndex = VIEWS.indexOf(prev);
          const prevIndex = (currentIndex - 1 + VIEWS.length) % VIEWS.length;
          return VIEWS[prevIndex];
        });
      },
      "g l": () => {
        setView(prev => {
          const currentIndex = VIEWS.indexOf(prev);
          const nextIndex = (currentIndex + 1) % VIEWS.length;
          return VIEWS[nextIndex];
        });
      },
      // New chat: g o (open new)
      "g o": () => handleNewChat(),
      // Toggle theme: g t
      "g t": () => toggleTheme(),
    });
    return () => unsubscribe();
  }, [handleNewChat, toggleTheme]);

  const handleAddToCanvas = useCallback(
    async (content: string) => {
      const nodeId = await createNode({
        type: "chat_reference",
        content,
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
        conversationId: selectedConversation ?? undefined,
      });

      embedCanvasNode({ nodeId, content }).catch(console.error);

      try {
        const related = await findRelated({ query: content, limit: 3 });

        for (const node of related.nodes) {
          if (node && node._id !== nodeId) {
            await createEdge({
              source: nodeId,
              target: node._id as Id<"canvasNodes">,
              label: `${Math.round(node.score * 100)}% related`,
            });
          }
        }
      } catch (err) {
        console.error("Failed to find related content:", err);
      }

      // Switch to canvas view on mobile to show the new node
      if (isMobile) {
        setView("canvas");
      }
    },
    [
      createNode,
      createEdge,
      embedCanvasNode,
      findRelated,
      selectedConversation,
      isMobile,
    ]
  );

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border bg-card safe-area-top">
        <div className="flex items-center gap-3">
          {/* Mobile menu button */}
          {isMobile && view === "chat" && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          )}
          <h1 className="text-lg md:text-xl font-semibold tracking-tight">
            Memex
          </h1>
          {isStandalone && (
            <span className="hidden md:inline text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              PWA
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {/* Install button */}
          {canInstall && (
            <button
              onClick={install}
              className="flex items-center gap-1.5 px-2 py-1.5 md:px-3 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span className="hidden md:inline">Install</span>
            </button>
          )}

          {/* Theme Toggle */}
          <div className="flex items-center gap-1.5 md:gap-2">
            <Sun className="h-4 w-4 text-muted-foreground" />
            <Switch
              checked={theme === "dark"}
              onCheckedChange={toggleTheme}
              aria-label="Toggle theme"
            />
            <Moon className="h-4 w-4 text-muted-foreground" />
          </div>

          {/* Desktop View Toggle */}
          {!isMobile && (
            <div className="flex gap-1 bg-secondary rounded-lg p-1">
              <button
                onClick={() => setView("chat")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === "chat"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setView("canvas")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === "canvas"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Canvas
              </button>
              <button
                onClick={() => setView("notes")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === "notes"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Notes
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Semantic Search */}
      <SemanticSearch />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Sidebar Overlay */}
        {isMobile && sidebarOpen && (
          <div
            className="absolute inset-0 bg-black/50 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Chat Sidebar */}
        {view === "chat" && (
          <div
            className={`
              ${isMobile ? "absolute left-0 top-0 bottom-0 z-50 transform transition-transform duration-200" : ""}
              ${isMobile && !sidebarOpen ? "-translate-x-full" : "translate-x-0"}
            `}
          >
            <ChatSidebar
              selectedId={selectedConversation}
              onSelect={(id) => {
                setSelectedConversation(id);
                if (isMobile) setSidebarOpen(false);
              }}
            />
          </div>
        )}

        {/* Chat Panel */}
        {view === "chat" && (
          <div className="flex-1 w-full">
            {selectedConversation ? (
              <ChatInterface
                conversationId={selectedConversation}
                onAddToCanvas={handleAddToCanvas}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 p-4">
                <MessageSquare className="h-12 w-12 opacity-50" />
                <p className="text-center">
                  {isMobile
                    ? "Tap the menu to select a conversation"
                    : "Select or create a conversation"}
                </p>
                {isMobile && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                  >
                    Open Chats
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Canvas Panel */}
        {view === "canvas" && (
          <div className="flex-1 w-full h-full">
            <MemexCanvas />
          </div>
        )}

        {/* Notes Panel */}
        {view === "notes" && <NotesView />}
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <nav className="flex items-center justify-around bg-card border-t border-border safe-area-bottom py-2">
          <button
            onClick={() => setView("chat")}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
              view === "chat"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare className="h-6 w-6" />
            <span className="text-xs font-medium">Chat</span>
          </button>
          <button
            onClick={() => setView("canvas")}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
              view === "canvas"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-6 w-6" />
            <span className="text-xs font-medium">Canvas</span>
          </button>
          <button
            onClick={() => setView("notes")}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
              view === "notes"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-6 w-6" />
            <span className="text-xs font-medium">Notes</span>
          </button>
        </nav>
      )}

      {/* Floating Action Buttons */}
      <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 flex flex-col items-end gap-3 safe-area-bottom">
        {/* New Chat Button */}
        <button
          onClick={handleNewChat}
          className="w-12 h-12 md:w-11 md:h-11 rounded-full flex items-center justify-center bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg hover:shadow-xl active:scale-95 transition-all touch-manipulation"
          title="New chat"
          aria-label="New chat"
        >
          <Plus className="w-6 h-6 md:w-5 md:h-5" />
        </button>

        {/* Voice Recorder */}
        <VoiceRecorder
          onProcessingComplete={(result) => {
            console.log(`Created ${result.conceptCount} notes from voice`);
            // Switch to canvas view to see the new notes
            setView("canvas");
          }}
        />
      </div>
    </div>
  );
}
