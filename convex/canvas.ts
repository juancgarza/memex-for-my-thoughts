import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listNodes = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("canvasNodes").collect();
  },
});

export const getNodeById = query({
  args: { id: v.id("canvasNodes") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const listEdges = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("canvasEdges").collect();
  },
});

export const createNode = mutation({
  args: {
    type: v.union(
      v.literal("text"),
      v.literal("chat_reference"),
      v.literal("note"),
    ),
    content: v.string(),
    x: v.number(),
    y: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    messageId: v.optional(v.id("messages")),
    conversationId: v.optional(v.id("conversations")),
    // Zettelkasten source tracking
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
    sourceId: v.optional(v.id("voiceNotes")),
    sourceUrl: v.optional(v.string()),
    parentNodeId: v.optional(v.id("canvasNodes")),
    outgoingLinks: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("canvasNodes", {
      type: args.type,
      content: args.content,
      x: args.x,
      y: args.y,
      width: args.width ?? 300,
      height: args.height ?? 150,
      messageId: args.messageId,
      conversationId: args.conversationId,
      sourceType: args.sourceType ?? "manual",
      sourceId: args.sourceId,
      sourceUrl: args.sourceUrl,
      parentNodeId: args.parentNodeId,
      outgoingLinks: args.outgoingLinks,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateNode = mutation({
  args: {
    id: v.id("canvasNodes"),
    content: v.optional(v.string()),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    outgoingLinks: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined),
    );

    await ctx.db.patch(id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

export const updateNodeEmbedding = mutation({
  args: {
    id: v.id("canvasNodes"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      embedding: args.embedding,
    });
  },
});

export const deleteNode = mutation({
  args: { id: v.id("canvasNodes") },
  handler: async (ctx, args) => {
    // Delete connected edges
    const sourceEdges = await ctx.db
      .query("canvasEdges")
      .withIndex("by_source", (q) => q.eq("source", args.id))
      .collect();

    const targetEdges = await ctx.db
      .query("canvasEdges")
      .withIndex("by_target", (q) => q.eq("target", args.id))
      .collect();

    for (const edge of [...sourceEdges, ...targetEdges]) {
      await ctx.db.delete(edge._id);
    }

    await ctx.db.delete(args.id);
  },
});

export const createEdge = mutation({
  args: {
    source: v.id("canvasNodes"),
    target: v.id("canvasNodes"),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("canvasEdges", {
      source: args.source,
      target: args.target,
      label: args.label,
      createdAt: Date.now(),
    });
  },
});

export const deleteEdge = mutation({
  args: { id: v.id("canvasEdges") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Get backlinks for a node (nodes that link TO this node)
export const getBacklinks = query({
  args: { nodeId: v.id("canvasNodes") },
  handler: async (ctx, args) => {
    // Get edges where this node is the target
    const incomingEdges = await ctx.db
      .query("canvasEdges")
      .withIndex("by_target", (q) => q.eq("target", args.nodeId))
      .collect();

    // Get source nodes with edge labels
    const sourceNodes = await Promise.all(
      incomingEdges.map(async (edge) => {
        const node = await ctx.db.get(edge.source);
        return node ? { ...node, edgeLabel: edge.label } : null;
      })
    );

    return sourceNodes.filter(Boolean);
  },
});

// Get nodes created from a voice note
export const getNodesByVoiceNote = query({
  args: { voiceNoteId: v.id("voiceNotes") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("canvasNodes")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", args.voiceNoteId))
      .collect();
  },
});

// List all notes sorted by updatedAt (for Notes sidebar)
export const listNotes = query({
  args: {},
  handler: async (ctx) => {
    const nodes = await ctx.db.query("canvasNodes").collect();
    return nodes
      .filter((node) => node.type === "note")
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

// Find a note by title (for wiki-link navigation)
export const findNoteByTitle = query({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    if (!args.title) return null;
    
    const nodes = await ctx.db.query("canvasNodes").collect();
    const notes = nodes.filter((n) => n.type === "note");
    
    // Find note where title matches (first line or # heading)
    return notes.find((note) => {
      const firstLine = note.content.split("\n")[0];
      // Handle both plain text and HTML content
      const cleanLine = firstLine.replace(/<[^>]*>/g, ""); // Remove HTML tags
      const noteTitle = cleanLine.replace(/^#\s*/, "").trim();
      return noteTitle.toLowerCase() === args.title.toLowerCase();
    }) || null;
  },
});

// Helper to extract title from note content
function extractNoteTitle(content: string): string {
  const firstLine = content.split("\n")[0];
  const cleanLine = firstLine.replace(/<[^>]*>/g, ""); // Remove HTML tags
  return cleanLine.replace(/^#\s*/, "").trim() || "Untitled";
}

// Helper to extract wiki links from content (handles both raw [[text]] and HTML data-title)
function extractWikiLinksFromContent(content: string): string[] {
  const links: string[] = [];
  
  // Extract from raw [[text]] patterns
  const rawRegex = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = rawRegex.exec(content)) !== null) {
    links.push(match[1].toLowerCase());
  }
  
  // Also extract from HTML data-title attributes (TipTap saves as HTML)
  const htmlRegex = /data-title="([^"]+)"/g;
  while ((match = htmlRegex.exec(content)) !== null) {
    const title = match[1].toLowerCase();
    if (!links.includes(title)) {
      links.push(title);
    }
  }
  
  return links;
}

// Find today's daily note (if it exists)
export const findDailyNote = query({
  args: { dateString: v.string() }, // Format: "YYYY-MM-DD"
  handler: async (ctx, args) => {
    const nodes = await ctx.db.query("canvasNodes").collect();
    const notes = nodes.filter((n) => n.type === "note");
    
    // Look for a note with title matching the date
    return notes.find((note) => {
      const title = extractNoteTitle(note.content);
      return title === args.dateString;
    }) || null;
  },
});

// Create a daily note with template (using HTML for TipTap)
export const createDailyNote = mutation({
  args: { dateString: v.string() }, // Format: "YYYY-MM-DD"
  handler: async (ctx, args) => {
    const now = Date.now();
    const date = new Date(args.dateString);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    // Use HTML format for TipTap editor
    const content = `<h1>${args.dateString}</h1><h2>${dayName}, ${monthDay}</h2><h3>Morning</h3><ul><li><p></p></li></ul><h3>Tasks</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p></p></div></li></ul><h3>Notes</h3><p></p><h3>Evening Reflection</h3><p></p>`;
    
    return await ctx.db.insert("canvasNodes", {
      type: "note",
      content,
      x: 0,
      y: 0,
      width: 300,
      height: 150,
      sourceType: "manual",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Get backlinks for a note by its title (notes that link TO this note via [[wiki-links]])
export const getWikiLinkBacklinks = query({
  args: { noteTitle: v.string() },
  handler: async (ctx, args) => {
    if (!args.noteTitle) return [];
    
    const nodes = await ctx.db.query("canvasNodes").collect();
    const notes = nodes.filter((n) => n.type === "note");
    const targetTitle = args.noteTitle.toLowerCase();
    
    // Find notes that have this title in their outgoingLinks OR in their content
    const backlinks = notes.filter((note) => {
      // Check outgoingLinks array first (if populated)
      if (note.outgoingLinks?.some(
        (link) => link.toLowerCase() === targetTitle
      )) {
        return true;
      }
      
      // Also check content directly (fallback for notes saved before outgoingLinks was added)
      const contentLinks = extractWikiLinksFromContent(note.content);
      return contentLinks.includes(targetTitle);
    });
    
    // Return with extracted titles for display
    return backlinks.map((note) => ({
      ...note,
      title: extractNoteTitle(note.content),
    }));
  },
});
