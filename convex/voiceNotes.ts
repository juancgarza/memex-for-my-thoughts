import { v } from "convex/values";
import { mutation, query, action, QueryCtx, MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Access environment variables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getEnv = (key: string) =>
  (globalThis as any).process?.env?.[key] as string | undefined;
const getSiteUrl = () => getEnv("SITE_URL") || "http://localhost:3005";
const getOpenAIKey = () => getEnv("OPENAI_API_KEY");

// Helper to get authenticated user
async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  return identity;
}

// Generate upload URL for audio file
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await getAuthenticatedUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

// Create voice note record after upload
export const create = mutation({
  args: {
    fileId: v.id("_storage"),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await getAuthenticatedUser(ctx);
    const now = Date.now();
    return await ctx.db.insert("voiceNotes", {
      userId: identity.subject,
      fileId: args.fileId,
      duration: args.duration,
      status: "uploaded",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update voice note status
export const updateStatus = mutation({
  args: {
    id: v.id("voiceNotes"),
    status: v.union(
      v.literal("recording"),
      v.literal("uploaded"),
      v.literal("transcribing"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("error")
    ),
    transcription: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await getAuthenticatedUser(ctx);

    const voiceNote = await ctx.db.get(args.id);
    if (!voiceNote || voiceNote.userId !== identity.subject) {
      throw new Error("Not found");
    }

    const { id, status, transcription, errorMessage } = args;
    const updates: {
      status: typeof status;
      transcription?: string;
      errorMessage?: string;
      updatedAt: number;
    } = {
      status,
      updatedAt: Date.now(),
    };

    if (transcription !== undefined) {
      updates.transcription = transcription;
    }
    if (errorMessage !== undefined) {
      updates.errorMessage = errorMessage;
    }

    await ctx.db.patch(id, updates);
  },
});

// Get voice note by ID
export const get = query({
  args: { id: v.id("voiceNotes") },
  handler: async (ctx, args) => {
    const identity = await getAuthenticatedUser(ctx);

    const voiceNote = await ctx.db.get(args.id);
    if (!voiceNote || voiceNote.userId !== identity.subject) {
      return null;
    }
    return voiceNote;
  },
});

// List recent voice notes
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await getAuthenticatedUser(ctx);

    return await ctx.db
      .query("voiceNotes")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .take(args.limit ?? 20);
  },
});

// Get audio file URL
export const getAudioUrl = query({
  args: { fileId: v.id("_storage") },
  handler: async (ctx, args) => {
    // Note: We can't easily verify ownership of storage files
    // The fileId should only be known if user has access to the voice note
    await getAuthenticatedUser(ctx);
    return await ctx.storage.getUrl(args.fileId);
  },
});

// Process voice note: transcribe + extract concepts + create nodes
export const process = action({
  args: { voiceNoteId: v.id("voiceNotes") },
  handler: async (ctx, args): Promise<{ success: boolean; conceptCount: number }> => {
    // Get voice note (this will verify ownership via the query)
    const voiceNote = await ctx.runQuery(api.voiceNotes.get, {
      id: args.voiceNoteId,
    });
    if (!voiceNote) throw new Error("Voice note not found");

    // Update status to transcribing
    await ctx.runMutation(api.voiceNotes.updateStatus, {
      id: args.voiceNoteId,
      status: "transcribing",
    });

    try {
      // Get audio file URL
      const audioUrl = await ctx.runQuery(api.voiceNotes.getAudioUrl, {
        fileId: voiceNote.fileId,
      });
      if (!audioUrl) throw new Error("Audio file not found");

      // Fetch audio file
      const audioResponse = await fetch(audioUrl);
      const audioBlob = await audioResponse.blob();

      // Call OpenAI Whisper API directly from Convex
      const openAIFormData = new FormData();
      openAIFormData.append("file", audioBlob, "audio.webm");
      openAIFormData.append("model", "whisper-1");
      openAIFormData.append("response_format", "json");

      const transcribeResponse = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getOpenAIKey()}`,
          },
          body: openAIFormData,
        }
      );

      if (!transcribeResponse.ok) {
        const errorText = await transcribeResponse.text();
        console.error("Whisper API error:", errorText);
        throw new Error(`Transcription failed: ${errorText}`);
      }

      const whisperResult = await transcribeResponse.json();
      const transcription = whisperResult.text;

      // Update with transcription
      await ctx.runMutation(api.voiceNotes.updateStatus, {
        id: args.voiceNoteId,
        status: "processing",
        transcription,
      });

      // Get existing notes for context (user-scoped via the query)
      const existingNodes = await ctx.runQuery(api.canvas.listNodes);

      // Extract concepts via AI (still use Vercel route for Anthropic)
      const appUrl = getSiteUrl();
      const extractResponse = await fetch(`${appUrl}/api/extract-concepts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcription,
          existingNotes: existingNodes.map((n: { content: string }) => ({
            content: n.content,
          })),
        }),
      });

      if (!extractResponse.ok) {
        const error = await extractResponse.text();
        throw new Error(`Concept extraction failed: ${error}`);
      }

      const { concepts } = await extractResponse.json();

      // Create nodes for each concept in a grid pattern
      const createdNodeIds: Id<"canvasNodes">[] = [];
      let xOffset = 0;
      const baseX = 100 + Math.random() * 200;
      const baseY = 100 + Math.random() * 200;

      for (const concept of concepts) {
        // Build content with wiki links
        const wikiLinks = concept.suggestedLinks
          ?.map((l: string) => `[[${l}]]`)
          .join(" ");
        const content = `# ${concept.title}\n\n${concept.content}${wikiLinks ? `\n\n${wikiLinks}` : ""}`;

        const nodeId = await ctx.runMutation(api.canvas.createNode, {
          type: "note" as const,
          content,
          x: baseX + xOffset,
          y: baseY,
          sourceType: "voice" as const,
          sourceId: args.voiceNoteId,
        });

        createdNodeIds.push(nodeId);

        // Embed the node
        await ctx.runAction(api.embeddings.embedCanvasNode, {
          nodeId,
          content: concept.content,
        });

        // Find and create edges to related nodes
        const related = await ctx.runAction(api.embeddings.findRelated, {
          query: concept.content,
          limit: 3,
        });

        for (const relatedNode of related.nodes) {
          if (
            relatedNode &&
            relatedNode._id !== nodeId &&
            !createdNodeIds.includes(relatedNode._id as Id<"canvasNodes">)
          ) {
            await ctx.runMutation(api.canvas.createEdge, {
              source: nodeId,
              target: relatedNode._id as Id<"canvasNodes">,
              label: `${Math.round(relatedNode.score * 100)}%`,
            });
          }
        }

        xOffset += 350;
      }

      // Mark complete
      await ctx.runMutation(api.voiceNotes.updateStatus, {
        id: args.voiceNoteId,
        status: "completed",
      });

      return { success: true, conceptCount: concepts.length };
    } catch (error) {
      console.error("Voice note processing error:", error);
      await ctx.runMutation(api.voiceNotes.updateStatus, {
        id: args.voiceNoteId,
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});
