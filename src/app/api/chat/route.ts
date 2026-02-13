import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import WebSocket from "ws"

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || ""
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ""

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

  // Send to OpenClaw Gateway via WebSocket
  let assistantContent: string

  try {
    assistantContent = await sendToGateway(content)
  } catch (error) {
    console.error("Gateway error:", error)
    assistantContent = `⚠️ Could not reach the OpenClaw Gateway. Error: ${error instanceof Error ? error.message : "Unknown error"}`
  }

  // Store assistant message
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

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

async function sendToGateway(message: string): Promise<string> {
  if (!GATEWAY_URL) {
    throw new Error("OPENCLAW_GATEWAY_URL not configured")
  }

  const wsUrl = GATEWAY_URL
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://")

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error("Gateway timeout (60s)"))
    }, 60000)

    const ws = new WebSocket(wsUrl)
    let responseText = ""
    let connectNonce: string | null = null
    let chatSendAcked = false

    function sendRequest(method: string, params: Record<string, unknown> = {}) {
      const id = generateId()
      ws.send(JSON.stringify({
        type: "req",
        id,
        method,
        params
      }))
      return id
    }

    function doConnect() {
      sendRequest("connect", {
        auth: { token: GATEWAY_TOKEN },
        ...(connectNonce ? { nonce: connectNonce } : {}),
        userAgent: "jacob-command-center/1.0"
      })
    }

    ws.on("open", () => {
      // Wait for challenge or send connect directly
      // Gateway may send a challenge nonce first
      // Set a small delay then connect if no challenge received
      setTimeout(() => {
        if (!connectNonce) {
          doConnect()
        }
      }, 500)
    })

    ws.on("message", (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString())

        // Handle challenge nonce
        if (msg.type === "event" && msg.event === "connect.challenge") {
          connectNonce = msg.payload?.nonce || null
          doConnect()
          return
        }

        // Handle connect response (success)
        if (msg.type === "res" && msg.payload !== undefined && !chatSendAcked) {
          // This is likely the connect ack, now send chat
          sendRequest("chat.send", {
            content: message,
            source: "command-center"
          })
          return
        }

        // Handle chat.send ack
        if (msg.type === "res" && !chatSendAcked) {
          chatSendAcked = true
          // Now wait for streaming events
          return
        }

        // Handle streaming chat events
        if (msg.type === "event" && msg.event === "chat") {
          const p = msg.payload || {}

          // Accumulate text from various possible fields
          if (p.delta) responseText += p.delta
          if (p.content && p.kind === "delta") responseText += p.content
          if (p.text && p.kind === "delta") responseText += p.text

          // Check for completion
          if (p.kind === "done" || p.kind === "complete" || p.kind === "end" || p.done === true) {
            // Use final content if provided and we have nothing yet
            if (!responseText && p.content) responseText = p.content
            if (!responseText && p.text) responseText = p.text
            clearTimeout(timeout)
            ws.close()
            resolve(responseText || "No response received.")
            return
          }
          return
        }

        // Handle error
        if (msg.type === "res" && msg.ok === false) {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(msg.error?.message || "Gateway request failed"))
          return
        }

      } catch {
        // Non-JSON, ignore
      }
    })

    ws.on("close", (code: number, reason: Buffer) => {
      clearTimeout(timeout)
      if (responseText) {
        resolve(responseText)
      } else {
        reject(new Error(`WebSocket closed (code: ${code}, reason: ${reason?.toString() || "none"})`))
      }
    })

    ws.on("error", (err: Error) => {
      clearTimeout(timeout)
      reject(new Error(`WebSocket error: ${err.message}`))
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
