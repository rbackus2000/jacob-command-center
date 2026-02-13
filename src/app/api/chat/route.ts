import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || ""
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ""

export const maxDuration = 60

// POST: Send message and poll for response (resilient to slow responses)
export async function POST(req: NextRequest) {
  const { content } = await req.json()
  const supabase = createServerClient()

  // Save user message immediately
  const { data: userMessage, error: userError } = await supabase
    .from("chat_messages")
    .insert({ role: "user", content })
    .select()
    .single()

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 })
  }

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
