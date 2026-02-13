import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || ""
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ""

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { content } = await req.json()
  const supabase = createServerClient()

  const { data: userMessage, error: userError } = await supabase
    .from("chat_messages")
    .insert({ role: "user", content })
    .select()
    .single()

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 })
  }

  let assistantContent: string
  try {
    assistantContent = await sendToGateway(content)
  } catch (error) {
    console.error("Gateway error:", error)
    assistantContent = `⚠️ Could not reach the OpenClaw Gateway. Error: ${error instanceof Error ? error.message : "Unknown error"}`
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

async function sendToGateway(message: string): Promise<string> {
  if (!GATEWAY_URL) throw new Error("OPENCLAW_GATEWAY_URL not configured")

  const wsUrl = GATEWAY_URL.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://")

  // Use native WebSocket (available in Node 20+)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error("Gateway timeout (55s)"))
    }, 55000)

    const ws = new WebSocket(wsUrl)
    let responseText = ""
    let connected = false
    let chatAcked = false

    function send(method: string, params: Record<string, unknown>) {
      const id = genId()
      ws.send(JSON.stringify({ type: "req", id, method, params }))
      return id
    }

    ws.addEventListener("open", () => {
      // Wait for connect.challenge event
    })

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(typeof event.data === "string" ? event.data : "")

        // Challenge → connect
        if (msg.type === "event" && msg.event === "connect.challenge") {
          send("connect", {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: "openclaw-control-ui",
              version: "1.0.0",
              platform: "linux",
              mode: "webchat",
              instanceId: "jcc-" + Date.now()
            },
            role: "operator",
            scopes: ["operator.admin"],
            caps: [],
            auth: { token: GATEWAY_TOKEN },
            userAgent: "jacob-command-center/1.0"
          })
          return
        }

        // Connect response
        if (msg.type === "res" && msg.ok === true && !connected) {
          connected = true
          send("chat.send", {
            sessionKey: "agent:main:main",
            message: message,
            idempotencyKey: genId()
          })
          return
        }

        // Connect error
        if (msg.type === "res" && msg.ok === false && !connected) {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(msg.error?.message || "Gateway connect failed"))
          return
        }

        // Chat.send ack
        if (msg.type === "res" && msg.ok === true && connected && !chatAcked) {
          chatAcked = true
          return
        }

        // Chat.send error
        if (msg.type === "res" && msg.ok === false && connected) {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(msg.error?.message || "chat.send failed"))
          return
        }

        // Streaming chat events
        if (msg.type === "event" && msg.event === "chat") {
          const p = msg.payload || {}

          // Accumulate deltas
          if (p.stream === "assistant" && p.data?.delta) {
            responseText += p.data.delta
          } else if (p.stream === "assistant" && p.data?.text) {
            responseText += p.data.text
          } else if (typeof p.delta === "string") {
            responseText += p.delta
          }

          // Done
          if (p.kind === "done" || p.kind === "end" || p.done === true) {
            if (!responseText && p.content) responseText = p.content
            clearTimeout(timeout)
            ws.close()
            resolve(responseText || "No response received.")
            return
          }
        }

        // Agent events with text
        if (msg.type === "event" && msg.event === "agent") {
          const p = msg.payload || {}
          if (p.stream === "assistant" && p.data?.delta) {
            responseText += p.data.delta
          }
          if (p.stream === "assistant" && p.data?.text && !p.data?.delta) {
            // full text update, replace
            responseText = p.data.text
          }
          if (p.kind === "done" || p.done === true) {
            clearTimeout(timeout)
            ws.close()
            resolve(responseText || "No response received.")
            return
          }
        }

      } catch {
        // ignore
      }
    })

    ws.addEventListener("close", () => {
      clearTimeout(timeout)
      if (responseText) resolve(responseText)
      else if (!connected) reject(new Error("Connection closed before authentication"))
      else reject(new Error("Connection closed without response"))
    })

    ws.addEventListener("error", () => {
      clearTimeout(timeout)
      reject(new Error("WebSocket connection error"))
    })
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
