import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { generateEmbedding } from "@/lib/embeddings"

export async function POST(req: NextRequest) {
  const { query, collection_id, match_count = 5 } = await req.json()

  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query)

    // Run similarity search
    const { data: chunks, error } = await supabase.rpc("match_document_chunks", {
      query_embedding: queryEmbedding,
      match_count: match_count,
      filter_collection_id: collection_id || null,
    })

    if (error) {
      console.error("Search error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Enrich with document names
    const documentIds = [...new Set((chunks || []).map((c: { document_id: string }) => c.document_id))]
    const { data: documents } = await supabase
      .from("documents")
      .select("id, name")
      .in("id", documentIds)

    const docMap = new Map((documents || []).map((d: { id: string; name: string }) => [d.id, d.name]))

    const results = (chunks || []).map((chunk: { id: string; document_id: string; content: string; metadata: Record<string, unknown>; similarity: number }) => ({
      id: chunk.id,
      document_id: chunk.document_id,
      document_name: docMap.get(chunk.document_id) || "Unknown",
      content: chunk.content,
      similarity: chunk.similarity,
    }))

    return NextResponse.json({ results })
  } catch (error) {
    console.error("Search error:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
