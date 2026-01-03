import { auth } from "@clerk/nextjs/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

export const maxDuration = 60;

const ConceptsSchema = z.object({
  concepts: z.array(
    z.object({
      title: z
        .string()
        .describe("A short title for this atomic concept (3-7 words)"),
      content: z
        .string()
        .describe("The atomic note content, one clear idea (1-3 sentences)"),
      suggestedLinks: z
        .array(z.string())
        .describe(
          "Suggested wiki-link targets to related concepts (existing or new)"
        ),
      tags: z.array(z.string()).describe("1-3 relevant tags for this concept"),
    })
  ),
  summary: z
    .string()
    .describe("One sentence summary of the entire transcription"),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { transcription, existingNotes } = await req.json();

    if (!transcription) {
      return Response.json(
        { error: "No transcription provided" },
        { status: 400 }
      );
    }

    const existingNotesList =
      existingNotes
        ?.slice(0, 20) // Limit context size
        ?.map(
          (n: { content: string }, i: number) =>
            `${i + 1}. ${n.content.slice(0, 100)}`
        )
        .join("\n") || "None yet";

    const { object } = await generateObject({
      model: anthropic("claude-sonnet-4-20250514"),
      schema: ConceptsSchema,
      prompt: `You are a Zettelkasten assistant helping to build a personal knowledge base. Analyze this voice note transcription and extract atomic concepts.

TRANSCRIPTION:
"${transcription}"

EXISTING NOTES IN THE SYSTEM (for context and linking):
${existingNotesList}

INSTRUCTIONS:
1. Break the transcription into atomic concepts - each should be a SINGLE clear idea that stands alone
2. Each concept must be self-contained and understandable without the original context
3. For suggestedLinks, reference:
   - Related concepts you're creating (by their title)
   - Existing notes that are relevant (use part of their content as the link text)
4. Keep each concept concise but complete (1-3 sentences)
5. Add 1-3 relevant tags for each concept
6. Return 1-5 concepts depending on content density - don't force more if the content is simple

Focus on capturing the USER'S ideas and insights, not meta-commentary about the recording.`,
    });

    return Response.json(object);
  } catch (error) {
    console.error("Concept extraction error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
