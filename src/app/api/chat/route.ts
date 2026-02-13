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

function sendWs(ws: WebSocket, method: string, params: Record<string, unknown>): string {
  const id = genId()
  ws.send(JSON.stringify({ type: "req", id, method, params }))
  return id
}

async function sendToGateway(message: string): Promise<string> {
  if (!GATEWAY_URL) throw new Error("OPENCLAW_GATEWAY_URL not configured")

  const wsUrl = GATEWAY_URL.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://")

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { ws.close(); reject(new Error("Gateway timeout (55s)")) }, 55000)

    const ws = new WebSocket(wsUrl)
    let connected = false
    let runId: string | null = null
    let historyReqId: string | null = null

    ws.addEventListener("open", () => {
      // Wait for challenge
    })

    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(typeof event.data === "string" ? event.data : "")

        // Challenge → connect
        if (msg.type === "event" && msg.event === "connect.challenge") {
          sendWs(ws, "connect", {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: "gateway-client",
              version: "1.0.0",
              platform: "linux",
              mode: "backend",
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
          clearTimeout(timeout)
          ws.close()
          reject(new Error(msg.error?.message || "Gateway connect failed"))
          return
        }

        // chat.send ack — get the runId
        if (msg.type === "res" && msg.ok === true && connected && !runId) {
          runId = msg.payload?.runId || null
          return
        }

        // Chat event with state=final → run complete, fetch history
        if (msg.type === "event" && msg.event === "chat" && msg.payload?.state === "final") {
          // Small delay to ensure the response is written to history
          setTimeout(() => {
            historyReqId = sendWs(ws, "chat.history", {
              sessionKey: "agent:main:main",
              limit: 5
            })
          }, 500)
          return
        }

        // History response → extract last assistant message
        if (msg.type === "res" && msg.id === historyReqId && msg.ok === true) {
          const messages = msg.payload?.messages || msg.payload || []
          // Find the last assistant message
          let lastAssistant = ""
          const msgArray = Array.isArray(messages) ? messages : []
          for (let i = msgArray.length - 1; i >= 0; i--) {
            const m = msgArray[i]
            if (m.role === "assistant") {
              // Extract text content
              if (typeof m.content === "string") {
                lastAssistant = m.content
              } else if (Array.isArray(m.content)) {
                lastAssistant = m.content
                  .filter((b: { type: string; text?: string }) => b.type === "text")
                  .map((b: { text: string }) => b.text)
                  .join("")
              }
              break
            }
          }
          clearTimeout(timeout)
          ws.close()
          resolve(lastAssistant || "No response received.")
          return
        }

        // Error on any request
        if (msg.type === "res" && msg.ok === false && connected) {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(msg.error?.message || "Gateway request failed"))
          return
        }

      } catch {
        // ignore
      }
    })

    ws.addEventListener("close", () => {
      clearTimeout(timeout)
      reject(new Error("Connection closed unexpectedly"))
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
