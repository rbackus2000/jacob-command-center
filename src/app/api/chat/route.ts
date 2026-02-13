import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

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

  // Send to OpenClaw Gateway via WebSocket and collect response
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

async function sendToGateway(message: string): Promise<string> {
  if (!GATEWAY_URL) {
    throw new Error("OPENCLAW_GATEWAY_URL not configured")
  }

  // Convert HTTP(S) URL to WS(S)
  const wsUrl = GATEWAY_URL
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://")

  // Use dynamic import for ws (Node.js WebSocket)
  const { default: WebSocket } = await import("ws")

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error("Gateway timeout (30s)"))
    }, 30000)

    const ws = new WebSocket(wsUrl)
    let responseText = ""
    let messageSent = false

    ws.on("open", () => {
      // Authenticate with the gateway
      ws.send(JSON.stringify({
        type: "connect",
        params: {
          auth: { token: GATEWAY_TOKEN }
        }
      }))
    })

    ws.on("message", (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString())

        // Handle connection acknowledgement
        if (msg.type === "connected" || msg.type === "connect.ack") {
          // Send the chat message
          ws.send(JSON.stringify({
            type: "chat.send",
            params: {
              content: message,
              source: "webchat"
            }
          }))
          messageSent = true
          return
        }

        // Handle chat response events
        if (msg.type === "chat" || msg.type === "chat.delta") {
          if (msg.params?.content) {
            responseText += msg.params.content
          }
          if (msg.params?.delta) {
            responseText += msg.params.delta
          }
          if (msg.params?.text) {
            responseText += msg.params.text
          }
          return
        }

        // Handle chat completion
        if (msg.type === "chat.done" || msg.type === "chat.end" || msg.type === "chat.complete") {
          // If there's a final content field, use it
          if (msg.params?.content && !responseText) {
            responseText = msg.params.content
          }
          clearTimeout(timeout)
          ws.close()
          resolve(responseText || "No response received from the agent.")
          return
        }

        // Handle errors
        if (msg.type === "error") {
          clearTimeout(timeout)
          ws.close()
          reject(new Error(msg.params?.message || msg.params?.error || "Gateway error"))
          return
        }

        // Handle ack for chat.send (response will stream after)
        if (msg.type === "chat.send.ack" || msg.type === "chat.ack") {
          // Wait for streaming response
          return
        }

      } catch {
        // Non-JSON message, ignore
      }
    })

    ws.on("close", () => {
      clearTimeout(timeout)
      if (messageSent && responseText) {
        resolve(responseText)
      } else if (!messageSent) {
        reject(new Error("Connection closed before message could be sent"))
      } else if (!responseText) {
        // Give it a moment in case we missed the final event
        resolve(responseText || "Connection closed without response.")
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
