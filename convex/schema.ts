import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Conversations - each chat session
  conversations: defineTable({
    userId: v.string(),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Messages within conversations
  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
    // Embedding for semantic search
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_conversation", ["conversationId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536, // OpenAI text-embedding-3-small
      filterFields: ["conversationId"],
    }),

  // Voice notes - audio recordings with transcriptions
  voiceNotes: defineTable({
    userId: v.string(),
    fileId: v.id("_storage"), // Convex file storage reference
    duration: v.number(), // Duration in seconds
    transcription: v.optional(v.string()),
    status: v.union(
      v.literal("recording"),
      v.literal("uploaded"),
      v.literal("transcribing"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    ),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  // Canvas nodes - blocks on the infinite canvas
  canvasNodes: defineTable({
    userId: v.string(),
    type: v.union(
      v.literal("text"),
      v.literal("chat_reference"),
      v.literal("note")
    ),
    content: v.string(),
    // Position on canvas
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    // Optional reference to a message or conversation
    messageId: v.optional(v.id("messages")),
    conversationId: v.optional(v.id("conversations")),
    // Source tracking for Zettelkasten
    sourceType: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("voice"),
        v.literal("chat"),
        v.literal("ai_extracted"),
        v.literal("web"),
        v.literal("youtube"),
        v.literal("readwise")
      )
    ),
    sourceId: v.optional(v.id("voiceNotes")), // Reference to source voice note
    sourceUrl: v.optional(v.string()), // URL for imported content
    parentNodeId: v.optional(v.id("canvasNodes")), // For atomic splits
    // Wiki links extracted from content
    outgoingLinks: v.optional(v.array(v.string())), // [[link]] targets
    // Embedding for semantic search
    embedding: v.optional(v.array(v.float64())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_sourceId", ["sourceId"])
    .index("by_parentNodeId", ["parentNodeId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["type", "userId"],
    }),

  // Edges connecting canvas nodes
  canvasEdges: defineTable({
    source: v.id("canvasNodes"),
    target: v.id("canvasNodes"),
    label: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_source", ["source"])
    .index("by_target", ["target"]),
});
