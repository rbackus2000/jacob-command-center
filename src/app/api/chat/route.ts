import { NextRequest, NextResponse } from "next/server"

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || ""
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ""

export const maxDuration = 60

// POST: Send message to Gateway (no Supabase - Gateway is source of truth)
export async function POST(req: NextRequest) {
  const { content } = await req.json()

  // Send to gateway and wait for response with retries
  let assistantContent: string
  try {
    assistantContent = await sendToGateway(content)
  } catch (error) {
    console.error("Gateway error:", error)
    // If timeout, try fetching latest response from history
    if (error instanceof Error && error.message.includes("timeout")) {
      try {
        assistantContent = await pollGatewayHistory(3)
      } catch {
        assistantContent = `⚠️ Response is taking longer than expected. Check Telegram for Jacob's reply, or try again.`
      }
    } else {
      assistantContent = `⚠️ Could not reach the OpenClaw Gateway. Error: ${error instanceof Error ? error.message : "Unknown error"}`
    }
  }

  return NextResponse.json({ 
    success: true,
    content: assistantContent 
  })
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function sendWs(ws: WebSocket, method: string, params: Record<string, unknown>): string {
  const id = genId()
  ws.send(JSON.stringify({ type: "req", id, method, params }))
  return id
}

// Poll gateway history to get latest assistant response
async function pollGatewayHistory(retries: number): Promise<string> {
  for (let i = 0; i < retries; i++) {
    await new Promise(r => setTimeout(r, 3000))
    try {
      const msg = await fetchLastAssistantMessage()
      if (msg) return msg
    } catch { /* retry */ }
  }
  throw new Error("Could not fetch response from history")
}

// Quick WS connect → fetch history → close
async function fetchLastAssistantMessage(): Promise<string | null> {
  const wsUrl = GATEWAY_URL.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://")

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { ws.close(); reject(new Error("History fetch timeout")) }, 10000)
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
          historyReqId = sendWs(ws, "chat.history", { sessionKey: "agent:main:main", limit: 3 })
          return
        }

        if (msg.type === "res" && msg.id === historyReqId && msg.ok === true) {
          const messages = Array.isArray(msg.payload?.messages) ? msg.payload.messages : Array.isArray(msg.payload) ? msg.payload : []
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i]
            if (m.role === "assistant") {
              let text = ""
              if (typeof m.content === "string") text = m.content
              else if (Array.isArray(m.content)) text = m.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("")
              clearTimeout(timeout); ws.close(); resolve(text || null); return
            }
          }
          clearTimeout(timeout); ws.close(); resolve(null); return
        }
      } catch { /* ignore */ }
    })

    ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("WS error")) })
    ws.addEventListener("close", () => { clearTimeout(timeout); reject(new Error("WS closed")) })
  })
}

async function sendToGateway(message: string): Promise<string> {
  if (!GATEWAY_URL) throw new Error("OPENCLAW_GATEWAY_URL not configured")

  const wsUrl = GATEWAY_URL.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://")

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { ws.close(); reject(new Error("Gateway timeout (45s)")) }, 45000)

    const ws = new WebSocket(wsUrl)
    let connected = false
    let runId: string | null = null
    let historyReqId: string | null = null

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(typeof event.data === "string" ? event.data : "")

        // Challenge → connect
        if (msg.type === "event" && msg.event === "connect.challenge") {
          sendWs(ws, "connect", {
            minProtocol: 3, maxProtocol: 3,
            client: { id: "gateway-client", version: "1.0.0", platform: "linux", mode: "backend", instanceId: "jcc-" + Date.now() },
            role: "operator", scopes: ["operator.admin"], caps: [],
            auth: { token: GATEWAY_TOKEN }, userAgent: "jacob-command-center/1.0"
          })
          return
        }

        // Connect success → send chat
        if (msg.type === "res" && msg.ok === true && !connected) {
          connected = true
          sendWs(ws, "chat.send", {
            sessionKey: "agent:main:main",
            message: message,
            idempotencyKey: genId()
          })
          return
        }

        // Connect error
        if (msg.type === "res" && msg.ok === false && !connected) {
          clearTimeout(timeout); ws.close()
          reject(new Error(msg.error?.message || "Gateway connect failed"))
          return
        }

        // chat.send ack
        if (msg.type === "res" && msg.ok === true && connected && !runId) {
          runId = msg.payload?.runId || "ack"
          return
        }

        // Chat event with state=final → fetch history
        if (msg.type === "event" && msg.event === "chat" && msg.payload?.state === "final") {
          setTimeout(() => {
            historyReqId = sendWs(ws, "chat.history", { sessionKey: "agent:main:main", limit: 5 })
          }, 500)
          return
        }

        // History response → extract last assistant message
        if (msg.type === "res" && msg.id === historyReqId && msg.ok === true) {
          const messages = Array.isArray(msg.payload?.messages) ? msg.payload.messages : Array.isArray(msg.payload) ? msg.payload : []
          let lastAssistant = ""
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i]
            if (m.role === "assistant") {
              if (typeof m.content === "string") lastAssistant = m.content
              else if (Array.isArray(m.content)) lastAssistant = m.content.filter((b: { type: string; text?: string }) => b.type === "text").map((b: { text: string }) => b.text).join("")
              break
            }
          }
          clearTimeout(timeout); ws.close()
          resolve(lastAssistant || "No response received.")
          return
        }

        // Error on any request
        if (msg.type === "res" && msg.ok === false && connected) {
          clearTimeout(timeout); ws.close()
          reject(new Error(msg.error?.message || "Gateway request failed"))
          return
        }
      } catch { /* ignore */ }
    })

    ws.addEventListener("close", () => { clearTimeout(timeout); reject(new Error("Connection closed unexpectedly")) })
    ws.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("WebSocket connection error")) })
  })
}

// GET: Fetch chat history from Gateway
export async function GET() {
  try {
    const messages = await fetchGatewayHistory(100)
    // Normalize to expected format: { id, role, content, created_at }
    const normalized = messages.map((m, idx) => ({
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

// Fetch chat history from Gateway via WebSocket
async function fetchGatewayHistory(limit: number): Promise<GatewayMessage[]> {
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
          historyReqId = sendWs(ws, "chat.history", { sessionKey: "agent:main:main", limit })
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

// Extract text content from Gateway message content
function extractTextContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === "text")
      .map((block) => block.text || "")
      .join("")
  }
  return ""
}

// Normalize timestamp to ISO string
function normalizeTimestamp(timestamp: number | string | undefined): string {
  if (!timestamp) return new Date().toISOString()
  if (typeof timestamp === "string") return timestamp
  if (typeof timestamp === "number") {
    // Handle both ms and seconds
    const ts = timestamp > 10000000000 ? timestamp : timestamp * 1000
    return new Date(ts).toISOString()
  }
  return new Date().toISOString()
}
