import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const maxDuration = 60;

interface ReadwiseHighlight {
  id: number;
  text: string;
  note: string;
  location: number;
  location_type: string;
  highlighted_at: string;
  book_id: number;
  url: string | null;
  tags: { id: number; name: string }[];
}

interface ReadwiseBook {
  id: number;
  title: string;
  author: string;
  category: string;
  source: string;
  num_highlights: number;
  cover_image_url: string;
  highlights_url: string;
  source_url: string | null;
  highlights: ReadwiseHighlight[];
}

async function fetchReadwiseExport(token: string, updatedAfter?: string) {
  const allBooks: ReadwiseBook[] = [];
  let nextPageCursor: string | null = null;

  do {
    const params = new URLSearchParams();
    if (nextPageCursor) params.append("pageCursor", nextPageCursor);
    if (updatedAfter) params.append("updatedAfter", updatedAfter);

    const response = await fetch(
      `https://readwise.io/api/v2/export/?${params}`,
      {
        headers: { Authorization: `Token ${token}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Readwise API error: ${response.status}`);
    }

    const data = await response.json();
    allBooks.push(...data.results);
    nextPageCursor = data.nextPageCursor;
  } while (nextPageCursor);

  return allBooks;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { updatedAfter } = await req.json();

    const token = process.env.READWISE_ACCESS_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Readwise not configured" },
        { status: 500 }
      );
    }

    const books = await fetchReadwiseExport(token, updatedAfter);

    // Convert each book to a note format
    const notes = books.map((book) => {
      const highlightsText = book.highlights
        .map((h) => {
          let text = `> ${h.text}`;
          if (h.note) text += `\n\n**Note**: ${h.note}`;
          if (h.tags.length > 0) {
            text += `\n\n*Tags: ${h.tags.map((t) => t.name).join(", ")}*`;
          }
          return text;
        })
        .join("\n\n---\n\n");

      const content = `# ${book.title}\n\n**Author**: ${book.author}\n**Category**: ${book.category}\n**Highlights**: ${book.num_highlights}\n\n## Highlights\n\n${highlightsText}`;

      return {
        bookId: book.id,
        title: book.title,
        author: book.author,
        content,
        highlightCount: book.num_highlights,
        sourceUrl: book.source_url || book.highlights_url,
      };
    });

    return NextResponse.json({
      books: notes,
      totalBooks: notes.length,
      totalHighlights: notes.reduce((sum, n) => sum + n.highlightCount, 0),
    });
  } catch (error) {
    console.error("Readwise import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
