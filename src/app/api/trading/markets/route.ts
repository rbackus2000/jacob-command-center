import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import crypto from "crypto"

export const dynamic = "force-dynamic"

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2"

async function getKalshiAuthHeaders(method: string, apiPath: string) {
  const apiKey = process.env.KALSHI_API_KEY
  if (!apiKey) throw new Error("KALSHI_API_KEY not set")

  const keyPath = path.join(
    process.env.HOME || "/root",
    ".openclaw/workspace/.kalshi-private-key.pem"
  )
  const privateKeyPem = await fs.readFile(keyPath, "utf-8")

  const timestampMs = Date.now()
  const message = `${timestampMs}${method.toUpperCase()}${apiPath}`

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

    // Transform to our format
    const markets = (data.markets || []).map((m: Record<string, unknown>) => ({
      ticker: m.ticker,
      title: m.title,
      subtitle: m.subtitle || "",
      yes_bid: m.yes_bid != null ? Number(m.yes_bid) / 100 : null,
      yes_ask: m.yes_ask != null ? Number(m.yes_ask) / 100 : null,
      no_bid: m.no_bid != null ? Number(m.no_bid) / 100 : null,
      no_ask: m.no_ask != null ? Number(m.no_ask) / 100 : null,
      volume: m.volume || 0,
      close_time: m.close_time,
      category: m.category || "",
      status: m.status,
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
