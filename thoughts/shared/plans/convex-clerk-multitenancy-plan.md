# Convex + Clerk Integration & Multi-Tenant Data Isolation Plan

## Overview

Integrate Clerk authentication with Convex backend and add multi-tenant data isolation so each user only sees their own data. Currently Clerk and Convex run independently - this plan connects them and scopes all data by userId.

## Current State Analysis

- **Clerk auth implemented**: Middleware protects routes, API routes check `auth()`
- **Convex NOT integrated with Clerk**: Uses separate `ConvexProvider`, no auth context
- **No userId on any table**: All data globally accessible
- **30+ queries/mutations**: None check user identity

### Key Files:
- `src/app/providers.tsx` - ConvexProvider (not connected to Clerk)
- `convex/schema.ts` - 5 tables, no userId fields
- `convex/conversations.ts` - 5 functions, no auth
- `convex/canvas.ts` - 15 functions, no auth
- `convex/messages.ts` - 5 functions, no auth
- `convex/voiceNotes.ts` - 6 functions, no auth
- `convex/embeddings.ts` - 4 functions, no auth

## Desired End State

- Convex functions have access to authenticated user identity
- All primary tables have `userId` field with index
- All queries filter by authenticated user's ID
- All mutations validate ownership before updates/deletes
- Users can only see and modify their own data

## What We're NOT Doing

- Sharing/collaboration features
- Admin access to all data
- Data migration for existing records (fresh start)
- Rate limiting or usage quotas

## Implementation Approach

1. Wire up Clerk JWT to Convex using `ConvexProviderWithClerk`
2. Add `userId` to schema with indexes
3. Update all Convex functions to check identity and filter by userId
4. Messages/edges inherit security from parent records

---

## Phase 1: Convex + Clerk Integration

### Overview
Connect Clerk authentication to Convex so `ctx.auth.getUserIdentity()` works in Convex functions.

### Changes Required:

#### 1. Create Auth Config
**File**: `convex/auth.config.ts` (NEW)

```typescript
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

#### 2. Update Providers
**File**: `src/app/providers.tsx`
**Changes**: Replace `ConvexProvider` with `ConvexProviderWithClerk`

```typescript
"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL as string;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <ClerkProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </ClerkProvider>
    );
  }

  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <ThemeProvider>{children}</ThemeProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

#### 3. Configure Clerk JWT Template
**Manual Step**: In Clerk Dashboard:
1. Go to JWT Templates
2. Create new template named "convex"
3. Use Convex template or set issuer to your Clerk domain

#### 4. Add Environment Variable
**File**: `.env.local`
```
CLERK_JWT_ISSUER_DOMAIN=https://fair-anteater-94.clerk.accounts.dev
```

### Success Criteria:

#### Automated Verification:
- [ ] Build passes: `pnpm build`
- [ ] TypeScript compiles: `pnpm tsc --noEmit`

#### Manual Verification:
- [ ] `ctx.auth.getUserIdentity()` returns user in Convex functions
- [ ] App loads without errors when authenticated

---

## Phase 2: Schema Migration

### Overview
Add `userId` field and indexes to all primary tables that need user isolation.

### Changes Required:

#### 1. Update Schema
**File**: `convex/schema.ts`

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  conversations: defineTable({
    userId: v.string(),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
    embedding: v.optional(v.array(v.float64())),
  })
    .index("by_conversation", ["conversationId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["conversationId"],
    }),

  voiceNotes: defineTable({
    userId: v.string(),
    fileId: v.id("_storage"),
    duration: v.number(),
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

  canvasNodes: defineTable({
    userId: v.string(),
    type: v.union(
      v.literal("text"),
      v.literal("chat_reference"),
      v.literal("note")
    ),
    content: v.string(),
    x: v.number(),
    y: v.number(),
    width: v.number(),
    height: v.number(),
    messageId: v.optional(v.id("messages")),
    conversationId: v.optional(v.id("conversations")),
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

  canvasEdges: defineTable({
    source: v.id("canvasNodes"),
    target: v.id("canvasNodes"),
    label: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_source", ["source"])
    .index("by_target", ["target"]),
});
```

### Success Criteria:

#### Automated Verification:
- [ ] Convex schema pushes successfully: `npx convex dev` (or deploy)
- [ ] No TypeScript errors

#### Manual Verification:
- [ ] Tables have new userId field in Convex dashboard

---

## Phase 3: Update Conversations Module

### Overview
Add auth checks and userId filtering to conversations.ts

### Changes Required:

#### 1. Update conversations.ts
**File**: `convex/conversations.ts`

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    
    return await ctx.db
      .query("conversations")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    
    const conversation = await ctx.db.get(args.id);
    if (!conversation || conversation.userId !== identity.subject) {
      return null;
    }
    return conversation;
  },
});

export const create = mutation({
  args: { title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    
    const now = Date.now();
    return await ctx.db.insert("conversations", {
      userId: identity.subject,
      title: args.title ?? "New Chat",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTitle = mutation({
  args: { id: v.id("conversations"), title: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    
    const conversation = await ctx.db.get(args.id);
    if (!conversation || conversation.userId !== identity.subject) {
      throw new Error("Not found");
    }
    
    await ctx.db.patch(args.id, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    
    const conversation = await ctx.db.get(args.id);
    if (!conversation || conversation.userId !== identity.subject) {
      throw new Error("Not found");
    }
    
    // Delete all messages in the conversation
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.id))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    await ctx.db.delete(args.id);
  },
});
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `pnpm tsc --noEmit`
- [ ] Build passes: `pnpm build`

#### Manual Verification:
- [ ] Creating conversation works when logged in
- [ ] List only shows user's own conversations

---

## Phase 4: Update Canvas Module

### Overview
Add auth checks and userId filtering to canvas.ts (nodes and edges)

### Changes Required:

#### 1. Update canvas.ts
**File**: `convex/canvas.ts`

Add auth helper at top and update all functions. Key patterns:

```typescript
// Helper to get authenticated user
async function getAuthenticatedUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  return identity;
}

// For queries - filter by userId
export const listNodes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await getAuthenticatedUser(ctx);
    return await ctx.db
      .query("canvasNodes")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
  },
});

// For mutations - add userId on create
export const createNode = mutation({
  // ... args
  handler: async (ctx, args) => {
    const identity = await getAuthenticatedUser(ctx);
    return await ctx.db.insert("canvasNodes", {
      userId: identity.subject,
      // ... rest of fields
    });
  },
});

// For updates - verify ownership
export const updateNode = mutation({
  // ... args
  handler: async (ctx, args) => {
    const identity = await getAuthenticatedUser(ctx);
    const node = await ctx.db.get(args.id);
    if (!node || node.userId !== identity.subject) {
      throw new Error("Not found");
    }
    // ... perform update
  },
});
```

Apply this pattern to all 15 functions in canvas.ts.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `pnpm tsc --noEmit`
- [ ] Build passes: `pnpm build`

#### Manual Verification:
- [ ] Notes view shows only user's notes
- [ ] Canvas shows only user's nodes
- [ ] Creating/editing nodes works

---

## Phase 5: Update Messages Module

### Overview
Messages inherit security from conversation - verify conversation ownership before operations.

### Changes Required:

#### 1. Update messages.ts
**File**: `convex/messages.ts`

```typescript
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    
    // Verify conversation belongs to user
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== identity.subject) {
      return [];
    }
    
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .collect();
  },
});

export const getById = query({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    
    const message = await ctx.db.get(args.id);
    if (!message) return null;
    
    // Verify conversation belongs to user
    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation || conversation.userId !== identity.subject) {
      return null;
    }
    
    return message;
  },
});

export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    
    // Verify conversation belongs to user
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== identity.subject) {
      throw new Error("Not found");
    }
    
    const now = Date.now();
    await ctx.db.patch(args.conversationId, { updatedAt: now });

    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      createdAt: now,
    });
  },
});

export const updateEmbedding = mutation({
  args: {
    id: v.id("messages"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    
    const message = await ctx.db.get(args.id);
    if (!message) throw new Error("Not found");
    
    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation || conversation.userId !== identity.subject) {
      throw new Error("Not found");
    }
    
    await ctx.db.patch(args.id, { embedding: args.embedding });
  },
});

export const remove = mutation({
  args: { id: v.id("messages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    
    const message = await ctx.db.get(args.id);
    if (!message) throw new Error("Not found");
    
    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation || conversation.userId !== identity.subject) {
      throw new Error("Not found");
    }
    
    await ctx.db.delete(args.id);
  },
});
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles
- [ ] Build passes

#### Manual Verification:
- [ ] Chat messages load for user's conversations
- [ ] Cannot access other users' messages

---

## Phase 6: Update VoiceNotes Module

### Overview
Add auth checks and userId to voice notes.

### Changes Required:

#### 1. Update voiceNotes.ts
**File**: `convex/voiceNotes.ts`

Update all functions with auth checks. Key changes:
- `generateUploadUrl` - add auth check
- `create` - add userId from identity
- `updateStatus` - verify ownership
- `get` - verify ownership  
- `list` - filter by userId
- `getAudioUrl` - verify ownership of voice note
- `process` - verify ownership (action)

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles
- [ ] Build passes

#### Manual Verification:
- [ ] Voice recording works
- [ ] Only user's voice notes visible

---

## Phase 7: Update Embeddings Module

### Overview
Update vector search and embedding functions to respect user boundaries.

### Changes Required:

#### 1. Update embeddings.ts
**File**: `convex/embeddings.ts`

Key changes:
- `findRelated` action needs to filter results by user
- Internal mutations don't need auth (called by actions that already verified)
- `embedMessage` and `embedCanvasNode` verify ownership before updating

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles
- [ ] Build passes

#### Manual Verification:
- [ ] Semantic search only returns user's content
- [ ] Related content suggestions work

---

## Testing Strategy

### Manual Testing Steps:
1. Sign out, verify redirect to sign-in
2. Sign up with new account (User A)
3. Create conversation, notes, record voice note
4. Sign out, create new account (User B)
5. Verify User B sees empty state (no User A data)
6. Create content as User B
7. Sign back in as User A, verify only sees own data

---

## Environment Setup Required

Before Phase 1:
1. Create Clerk JWT Template:
   - Go to Clerk Dashboard → JWT Templates
   - Create template named "convex"
   - Copy the issuer domain

2. Add to `.env.local`:
   ```
   CLERK_JWT_ISSUER_DOMAIN=https://your-clerk-domain.clerk.accounts.dev
   ```

3. Add to Convex environment (via dashboard or CLI):
   ```
   CLERK_JWT_ISSUER_DOMAIN=https://your-clerk-domain.clerk.accounts.dev
   ```

---

## References

- Clerk + Convex docs: https://docs.convex.dev/auth/clerk
- Clerk JWT Templates: https://clerk.com/docs/backend-requests/making/jwt-templates
