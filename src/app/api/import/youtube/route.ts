import { auth } from "@clerk/nextjs/server";
import { YoutubeTranscript } from "youtube-transcript";
import { NextResponse } from "next/server";

export const maxDuration = 30;

// Extract video ID from various YouTube URL formats
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/, // Just the ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL required" }, { status: 400 });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return NextResponse.json(
        { error: "Invalid YouTube URL" },
        { status: 400 }
      );
    }

    // Fetch transcript
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);

    // Combine transcript segments
    const transcript = transcriptItems
      .map((item) => item.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // Fetch video metadata via oEmbed (no API key needed)
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const metaResponse = await fetch(oembedUrl);
    const metadata = metaResponse.ok ? await metaResponse.json() : {};

    const title = metadata.title || `YouTube Video ${videoId}`;
    const author = metadata.author_name || "Unknown";
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const content = `# ${title}\n\n**Channel**: ${author}\n**Source**: ${youtubeUrl}\n\n## Transcript\n\n${transcript}`;

    return NextResponse.json({
      title,
      content,
      videoId,
      author,
      sourceUrl: youtubeUrl,
      transcriptLength: transcript.length,
    });
  } catch (error) {
    console.error("YouTube import error:", error);

    // Handle common errors
    if (error instanceof Error) {
      if (error.message.includes("Transcript is disabled")) {
        return NextResponse.json(
          { error: "Transcript not available for this video" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
