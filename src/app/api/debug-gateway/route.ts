import { NextResponse } from "next/server"

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || "NOT_SET"
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "NOT_SET"

export async function GET() {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    
    const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GATEWAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openclaw:main",
        messages: [{ role: "user", content: "reply with just the word pong" }],
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    
    const text = await res.text()
    return NextResponse.json({
      gatewayUrl: GATEWAY_URL ? GATEWAY_URL.substring(0, 30) + "..." : "NOT_SET",
      tokenSet: GATEWAY_TOKEN !== "NOT_SET" && GATEWAY_TOKEN.length > 0,
      status: res.status,
      elapsed: Date.now() - start,
      body: text.substring(0, 500),
    })
  } catch (err) {
    return NextResponse.json({
      gatewayUrl: GATEWAY_URL ? GATEWAY_URL.substring(0, 30) + "..." : "NOT_SET",
      tokenSet: GATEWAY_TOKEN !== "NOT_SET" && GATEWAY_TOKEN.length > 0,
      error: err instanceof Error ? err.message : String(err),
      elapsed: Date.now() - start,
    })
  }
}
