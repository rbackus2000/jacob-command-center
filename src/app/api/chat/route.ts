import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const { content } = await req.json()
  const supabase = createServerClient()

  // Store user message
  const { data: userMessage, error: userError } = await supabase
    .from("chat_messages")
    .insert({ role: "user", content })
    .select()
    .single()

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 })
  }

  // TODO: Connect to OpenClaw Gateway WebSocket for real AI responses
  // For now, generate a placeholder response
  const assistantContent = generatePlaceholderResponse(content)

  const { data: assistantMessage, error: assistantError } = await supabase
    .from("chat_messages")
    .insert({ role: "assistant", content: assistantContent })
    .select()
    .single()

  if (assistantError) {
    return NextResponse.json({ error: assistantError.message }, { status: 500 })
  }

  return NextResponse.json({ userMessage, assistantMessage })
}

function generatePlaceholderResponse(input: string): string {
  const lower = input.toLowerCase()
  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return "Hello Robert! 👋 I'm Jacob, your AI assistant. How can I help you today?"
  }
  if (lower.includes("knowledge") || lower.includes("document") || lower.includes("search")) {
    return "I can help you search through your knowledge base! Head over to the **Knowledge Base** tab to upload documents and search them with semantic search powered by OpenAI embeddings."
  }
  if (lower.includes("memory") || lower.includes("remember")) {
    return "My memory system stores important notes and context. You can view and manage memories in the **Memory** tab. I'll eventually sync with MEMORY.md files automatically."
  }
  return `I received your message: "${input}"\n\nI'm currently running in placeholder mode. Once connected to the OpenClaw Gateway, I'll be able to provide real AI-powered responses. You can configure the gateway connection in **Settings**.`
}

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ messages: data })
}
