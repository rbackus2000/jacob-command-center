import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { generateEmbedding, chunkText, extractTextFromFile } from "@/lib/embeddings"

export async function POST(req: NextRequest) {
  const supabase = createServerClient()

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  const collectionId = formData.get("collection_id") as string | null

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const fileName = file.name
  const fileType = file.type || inferMimeType(fileName)
  const fileSize = file.size
  const filePath = `uploads/${Date.now()}-${fileName}`

  try {
    // Upload file to Supabase Storage
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, buffer, { contentType: fileType })

    if (uploadError) {
      console.error("Storage upload error:", uploadError)
      // Continue without storage — we can still process the text
    }

    // Create document record
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        collection_id: collectionId || null,
        name: fileName,
        file_path: filePath,
        file_type: fileType,
        file_size: fileSize,
        status: "processing",
      })
      .select()
      .single()

    if (docError) {
      return NextResponse.json({ error: docError.message }, { status: 500 })
    }

    // Extract text content
    const textContent = await file.text()
    const extractedText = extractTextFromFile(textContent, fileType)

    // Update document with content
    await supabase
      .from("documents")
      .update({ content: extractedText })
      .eq("id", doc.id)

    // Chunk the text
    const chunks = chunkText(extractedText)

    // Generate embeddings and store chunks
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await generateEmbedding(chunks[i])
        await supabase.from("document_chunks").insert({
          document_id: doc.id,
          chunk_index: i,
          content: chunks[i],
          embedding: embedding,
          metadata: { file_name: fileName, chunk_of: chunks.length },
        })
      } catch (embError) {
        console.error(`Failed to embed chunk ${i}:`, embError)
      }
    }

    // Mark document as ready
    await supabase
      .from("documents")
      .update({ status: "ready" })
      .eq("id", doc.id)

    return NextResponse.json({
      document: doc,
      chunks_created: chunks.length,
    })
  } catch (error) {
    console.error("Upload processing error:", error)

    return NextResponse.json(
      { error: "Failed to process upload" },
      { status: 500 }
    )
  }
}

function inferMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "txt": return "text/plain"
    case "md": return "text/markdown"
    case "csv": return "text/csv"
    case "json": return "application/json"
    case "pdf": return "application/pdf"
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case "py": return "text/x-python"
    case "js": case "jsx": return "text/javascript"
    case "ts": case "tsx": return "text/typescript"
    case "sh": case "bash": return "text/x-shellscript"
    case "yaml": case "yml": return "text/yaml"
    case "xml": return "text/xml"
    case "html": return "text/html"
    case "css": return "text/css"
    case "swift": return "text/x-swift"
    case "sql": return "text/x-sql"
    case "env": case "ini": case "cfg": case "conf": case "toml": return "text/plain"
    case "log": return "text/plain"
    case "rtf": return "text/rtf"
    default: return "application/octet-stream"
  }
}
