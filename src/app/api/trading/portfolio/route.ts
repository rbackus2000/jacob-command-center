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

// Default portfolio data for when filesystem isn't available (Vercel serverless)
const DEFAULT_PORTFOLIO = {
  experiment: {
    name: "$100 to $20K Challenge",
    startDate: "2026-03-28",
    endDate: "2026-06-26",
    startingCapital: 100,
    goal: 20000,
    status: "paper-trading",
    dayNumber: 1,
  },
  balance: 100,
  cashAvailable: 100,
  portfolioValue: 100,
  positions: [],
  trades: [],
  paperTrades: [],
  watchlist: [
    {
      ticker: "KXWTI-26MAR31-T105.99",
      title: "WTI >$105.99 by March 31",
      direction: "NO",
      currentPrice: 0.75,
      myEstimate: 0.92,
      edge: 0.17,
      conviction: "medium",
      notes: "Market overpricing weekend tail risk from Iran.",
      resolves: "2026-03-31",
      status: "watching",
    },
    {
      ticker: "KXHOUSINGSTART-26APR17-T1.325",
      title: "Housing Starts >1.325M in March 2026",
      direction: "YES",
      currentPrice: 0.13,
      myEstimate: "TBD",
      edge: "TBD",
      conviction: "low",
      notes: "Needs February actual data to calibrate.",
      resolves: "2026-04-17",
      status: "researching",
    },
  ],
  dailyLog: [
    {
      date: "2026-03-28",
      balance: 100,
      pnl: 0,
      pnlPercent: 0,
      notes: "Day 1. API connected. Scanner built. Paper trading phase.",
    },
  ],
  stats: {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    bestTrade: null,
    worstTrade: null,
    avgEdge: 0,
  },
}

export async function GET() {
  try {
    // Try filesystem first (server/local), fall back to defaults (Vercel)
    let portfolio
    let dailyLogMd = ""

    try {
      const raw = await fs.readFile(PORTFOLIO_PATH, "utf-8")
      portfolio = JSON.parse(raw)
    } catch {
      portfolio = DEFAULT_PORTFOLIO
    }

    try {
      dailyLogMd = await fs.readFile(DAILY_LOG_PATH, "utf-8")
    } catch {
      dailyLogMd = "## 2026-03-28\nDay 1. Paper trading phase. Scanner and dashboard operational."
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
