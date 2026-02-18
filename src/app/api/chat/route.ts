import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || ""
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ""

export const maxDuration = 60

// POST: Send message to Gateway via HTTP, save to Supabase
export async function POST(req: NextRequest) {
  const { content, sessionKey: requestedSessionKey } = await req.json()

  const sessionKey = requestedSessionKey || "agent:main:main"
  if (!sessionKey.startsWith("agent:")) {
    return NextResponse.json({ error: "Invalid sessionKey" }, { status: 400 })
  }

  const agentId = sessionKey.split(":")[1] || "main"
  const supabase = createServerClient()

  // Save user message to Supabase
  await supabase.from("chat_messages").insert({
    role: "user",
    content,
    metadata: { sessionKey, agentId },
  })

  // Send to gateway via HTTP chat completions
  let assistantContent: string
  try {
    const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
        "x-openclaw-session-key": sessionKey,
      },
      body: JSON.stringify({
        model: `openclaw:${agentId}`,
        messages: [{ role: "user", content }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error("Gateway HTTP error:", response.status, errText)
      assistantContent = `⚠️ Gateway returned ${response.status}. ${errText.slice(0, 200)}`
    } else {
      const data = await response.json()
      assistantContent = data.choices?.[0]?.message?.content || "No response received."
    }
  } catch (error) {
    console.error("Gateway error:", error)
    assistantContent = `⚠️ Could not reach the OpenClaw Gateway. Error: ${error instanceof Error ? error.message : "Unknown error"}`
  }

  // Save assistant response to Supabase
  await supabase.from("chat_messages").insert({
    role: "assistant",
    content: assistantContent,
    metadata: { sessionKey, agentId },
  })

  return NextResponse.json({ success: true, content: assistantContent })
}

// GET: Fetch chat history from Supabase
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionKey = searchParams.get("sessionKey") || "agent:main:main"
    const limit = parseInt(searchParams.get("limit") || "100")

    if (!sessionKey.startsWith("agent:")) {
      return NextResponse.json({ error: "Invalid sessionKey" }, { status: 400 })
    }

    const supabase = createServerClient()

    // Fetch messages from Supabase, filtered by sessionKey in metadata
    // Also include old messages without metadata (legacy)
    const { data: messages, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, created_at, metadata")
      .order("created_at", { ascending: true })
      .limit(limit)

    if (error) {
      console.error("Supabase error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filter: show messages matching this sessionKey, or legacy messages (no sessionKey in metadata) for agent:main:main
    const filtered = (messages || []).filter((m) => {
      const msgSession = m.metadata?.sessionKey
      if (msgSession === sessionKey) return true
      // Legacy messages (no sessionKey) belong to main agent
      if (!msgSession && sessionKey === "agent:main:main") return true
      return false
    })

    const normalized = filtered.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    }))

    return NextResponse.json({ messages: normalized })
  } catch (error) {
    console.error("Failed to fetch messages:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch messages" }, { status: 500 })
  }
}
