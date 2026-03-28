import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

export const dynamic = "force-dynamic"

const PORTFOLIO_PATH = path.join(
  process.env.HOME || "/root",
  ".openclaw/workspace/memory/trading-portfolio.json"
)

const DAILY_LOG_PATH = path.join(
  process.env.HOME || "/root",
  ".openclaw/workspace/memory/trading-daily-log.md"
)

export async function GET() {
  try {
    const raw = await fs.readFile(PORTFOLIO_PATH, "utf-8")
    const portfolio = JSON.parse(raw)

    // Also try to read the daily log markdown
    let dailyLogMd = ""
    try {
      dailyLogMd = await fs.readFile(DAILY_LOG_PATH, "utf-8")
    } catch {
      // File might not exist yet
    }

    return NextResponse.json({
      ...portfolio,
      dailyLogMd,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Failed to load portfolio", details: message },
      { status: 500 }
    )
  }
}
