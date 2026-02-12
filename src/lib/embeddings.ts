import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  })
  return response.data[0].embedding
}

export function chunkText(text: string, maxTokens: number = 500, overlap: number = 50): string[] {
  // Approximate: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4
  const overlapChars = overlap * 4
  const chunks: string[] = []

  // Split by paragraphs first
  const paragraphs = text.split(/\n\s*\n/)
  let currentChunk = ""

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()
    if (!trimmed) continue

    if (currentChunk.length + trimmed.length + 1 > maxChars) {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
        // Keep overlap from end of current chunk
        const overlapText = currentChunk.slice(-overlapChars)
        currentChunk = overlapText + " " + trimmed
      } else {
        // Single paragraph is too long, split by sentences
        const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed]
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length > maxChars) {
            if (currentChunk) {
              chunks.push(currentChunk.trim())
              const overlapText = currentChunk.slice(-overlapChars)
              currentChunk = overlapText + " " + sentence
            } else {
              // Single sentence too long, force split
              for (let i = 0; i < sentence.length; i += maxChars - overlapChars) {
                chunks.push(sentence.slice(i, i + maxChars).trim())
              }
            }
          } else {
            currentChunk += " " + sentence
          }
        }
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks.filter(c => c.length > 0)
}

export function extractTextFromFile(content: string, fileType: string): string {
  switch (fileType) {
    case "text/plain":
    case "text/markdown":
    case "text/csv":
      return content
    case "application/json":
      try {
        const parsed = JSON.parse(content)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return content
      }
    default:
      return content
  }
}
