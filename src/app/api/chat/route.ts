import { NextRequest, NextResponse } from "next/server"

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || ""
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ""

export const maxDuration = 60

// POST: Send message to Gateway via HTTP Chat Completions API
export async function POST(req: NextRequest) {
  const { content, sessionKey: requestedSessionKey } = await req.json()

  const sessionKey = requestedSessionKey || "agent:main:main"
  if (!sessionKey.startsWith("agent:")) {
    return NextResponse.json({ error: "Invalid sessionKey" }, { status: 400 })
  }

  // Extract agent ID from sessionKey (e.g., "agent:main:main" → "main")
  const agentId = sessionKey.split(":")[1] || "main"

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
      return NextResponse.json({
        success: true,
        content: `⚠️ Gateway returned ${response.status}. ${errText.slice(0, 200)}`
      })
    }

    const data = await response.json()
    const assistantContent = data.choices?.[0]?.message?.content || "No response received."

    return NextResponse.json({ success: true, content: assistantContent })
  } catch (error) {
    console.error("Gateway error:", error)
    return NextResponse.json({
      success: true,
      content: `⚠️ Could not reach the OpenClaw Gateway. Error: ${error instanceof Error ? error.message : "Unknown error"}`
    })
  }
}

// GET: Fetch chat history from Gateway via HTTP Chat Completions API
// Note: The chat completions endpoint doesn't support history fetch,
// so we use the WebSocket approach as fallback for history only
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionKey = searchParams.get("sessionKey") || "agent:main:main"

    if (!sessionKey.startsWith("agent:")) {
      return NextResponse.json({ error: "Invalid sessionKey" }, { status: 400 })
    }

    const messages = await fetchGatewayHistory(100, sessionKey)
    const normalized = messages.map((m: GatewayMessage, idx: number) => ({
      id: m.id || `msg-${m.timestamp || idx}`,
      role: m.role,
      content: extractTextContent(m.content),
      created_at: normalizeTimestamp(m.timestamp)
    }))
    return NextResponse.json({ messages: normalized })
  } catch (error) {
    console.error("Failed to fetch Gateway history:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch messages" }, { status: 500 })
  }
}

interface GatewayMessage {
  id?: string
  role: "user" | "assistant" | "system"
  content: string | Array<{ type: string; text?: string }>
  timestamp?: number | string
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function sendWs(ws: WebSocket, method: string, params: Record<string, unknown>): string {
  const id = genId()
  ws.send(JSON.stringify({ type: "req", id, method, params }))
  return id
}

// Fetch chat history via WebSocket (history doesn't have an HTTP endpoint)
async function fetchGatewayHistory(limit: number, sessionKey: string): Promise<GatewayMessage[]> {
  const wsUrl = GATEWAY_URL.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://")

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { ws.close(); reject(new Error("History fetch timeout")) }, 15000)
    const ws = new WebSocket(wsUrl)
    let connected = false
    let historyReqId: string | null = null

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(typeof event.data === "string" ? event.data : "")

        if (msg.type === "event" && msg.event === "connect.challenge") {
          sendWs(ws, "connect", {
            minProtocol: 3, maxProtocol: 3,
            client: { id: "gateway-client", version: "1.0.0", platform: "linux", mode: "backend", instanceId: "jcc-hist-" + Date.now() },
            role: "operator", scopes: ["operator.admin"], caps: [],
            auth: { token: GATEWAY_TOKEN }, userAgent: "jacob-command-center/1.0"
          })
          return
        }

        if (msg.type === "res" && msg.ok === true && !connected) {
          connected = true
          historyReqId = sendWs(ws, "chat.history", { sessionKey, limit })
          return
        }

        if (msg.type === "res" && msg.id === historyReqId && msg.ok === true) {
          const messages = Array.isArray(msg.payload?.messages) ? msg.payload.messages : Array.isArray(msg.payload) ? msg.payload : []
          clearTimeout(timeout)
          ws.close()
          resolve(messages)
          return
        }

        if (msg.type === "res" && msg.ok === false) {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(msg.error?.message || "Gateway request failed"))
          return
        }
      } catch (err) {
        console.error("WS message parse error:", err)
      }
    })

    ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("WS error")) })
    ws.addEventListener("close", () => { clearTimeout(timeout); reject(new Error("WS closed")) })
  })
}

function extractTextContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content.filter((block) => block.type === "text").map((block) => block.text || "").join("")
  }
  return ""
}

function normalizeTimestamp(timestamp: number | string | undefined): string {
  if (!timestamp) return new Date().toISOString()
  if (typeof timestamp === "string") return timestamp
  if (typeof timestamp === "number") {
    const ts = timestamp > 10000000000 ? timestamp : timestamp * 1000
    return new Date(ts).toISOString()
  }
  return new Date().toISOString()
}
