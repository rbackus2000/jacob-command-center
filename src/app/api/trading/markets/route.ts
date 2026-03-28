import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import crypto from "crypto"

export const dynamic = "force-dynamic"

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2"

async function getKalshiAuthHeaders(method: string, apiPath: string) {
  const apiKey = process.env.KALSHI_API_KEY
  if (!apiKey) throw new Error("KALSHI_API_KEY not set")

  // Try env var first (for Vercel), fallback to file (for local/server)
  let privateKeyPem = process.env.KALSHI_PRIVATE_KEY?.replace(/\\n/g, "\n")
  if (!privateKeyPem) {
    try {
      const keyPath = path.join(
        process.env.HOME || "/root",
        ".openclaw/workspace/.kalshi-private-key.pem"
      )
      privateKeyPem = await fs.readFile(keyPath, "utf-8")
    } catch {
      throw new Error("KALSHI_PRIVATE_KEY not set and key file not found")
    }
  }

  const timestampMs = Date.now()
  // Kalshi requires full path with /trade-api/v2 prefix for signing
  const fullPath = `/trade-api/v2${apiPath}`
  const message = `${timestampMs}${method.toUpperCase()}${fullPath}`

  const signature = crypto
    .sign("sha256", Buffer.from(message), {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    })
    .toString("base64")

  return {
    "KALSHI-ACCESS-KEY": apiKey,
    "KALSHI-ACCESS-SIGNATURE": signature,
    "KALSHI-ACCESS-TIMESTAMP": timestampMs.toString(),
    "Content-Type": "application/json",
  }
}

export async function GET() {
  try {
    const apiPath = "/markets"
    const headers = await getKalshiAuthHeaders("GET", apiPath)

    const params = new URLSearchParams({
      limit: "30",
      status: "open",
    })

    const res = await fetch(`${KALSHI_API_BASE}${apiPath}?${params}`, {
      headers,
      next: { revalidate: 300 }, // Cache 5 min
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error("Kalshi API error:", res.status, errorText)
      return NextResponse.json(
        { error: "Kalshi API error", status: res.status, details: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()

    // Transform to our format — Kalshi API returns dollar strings
    const markets = (data.markets || []).map((m: Record<string, unknown>) => ({
      ticker: m.ticker,
      title: m.title,
      subtitle: m.yes_sub_title || m.no_sub_title || "",
      yes_bid: parseFloat(String(m.yes_bid_dollars || "0")),
      yes_ask: parseFloat(String(m.yes_ask_dollars || "0")),
      no_bid: parseFloat(String(m.no_bid_dollars || "0")),
      no_ask: parseFloat(String(m.no_ask_dollars || "0")),
      volume: parseFloat(String(m.volume_fp || "0")),
      open_interest: parseFloat(String(m.open_interest_fp || "0")),
      last_price: parseFloat(String(m.last_price_dollars || "0")),
      close_time: m.close_time,
      category: m.category || "",
      status: m.status,
      series: m.event_ticker || "",
    }))

    return NextResponse.json({ markets })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Markets API error:", message)
    return NextResponse.json(
      { error: "Failed to fetch markets", details: message },
      { status: 500 }
    )
  }
}
