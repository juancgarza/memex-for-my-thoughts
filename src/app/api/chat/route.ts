import { auth } from "@clerk/nextjs/server";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { streamText, UIMessage, convertToModelMessages } from "ai";
import { MODELS, DEFAULT_MODEL, type ModelId } from "@/lib/models";

export const maxDuration = 30;

function getModel(modelId: ModelId) {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) {
    // Fallback to default
    return anthropic(DEFAULT_MODEL);
  }
  
  if (model.provider === "anthropic") {
    return anthropic(modelId);
  } else {
    return openai(modelId);
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, model: modelId }: { messages: UIMessage[]; model?: ModelId } = await req.json();

  const result = streamText({
    model: getModel(modelId || DEFAULT_MODEL),
    system: `You are a helpful assistant in a personal knowledge management system called Memex.
You help the user organize their thoughts, explore ideas, and make connections between concepts.
Be concise but thorough. When relevant, suggest connections to previous topics discussed.`,
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
