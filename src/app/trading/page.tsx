"use client"

import { useEffect, useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  BarChart3,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Wallet,
  Crosshair,
  ScrollText,
  LineChart,
} from "lucide-react"

// Types
interface Trade {
  id: string
  market: string
  direction: "YES" | "NO"
  entry: number
  exit: number
  pnl: number
  entryDate: string
  exitDate: string
  holdTime?: string
}

interface Position {
  id: string
  market: string
  direction: "YES" | "NO"
  entry: number
  current: number
  size: number
  unrealizedPnl: number
  resolutionDate: string
}

interface DailyLogEntry {
  date: string
  note: string
  pnl: number
  balance: number
}

interface Portfolio {
  balance: number
  startDate: string
  goalAmount: number
  goalDays: number
  trades: Trade[]
  positions: Position[]
  dailyLog: DailyLogEntry[]
  dailyLogMd: string
}

interface Market {
  ticker: string
  title: string
  subtitle: string
  yes_bid: number | null
  yes_ask: number | null
  no_bid: number | null
  no_ask: number | null
  volume: number
  close_time: string
  category: string
  status: string
}

// Sparkline component
function Sparkline({ data, color = "#14b8a6" }: { data: number[]; color?: string }) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-10 text-xs text-muted-foreground">
        Not enough data
      </div>
    )
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const width = 200
  const height = 40
  const padding = 2

  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2)
      const y = height - padding - ((v - min) / range) * (height - padding * 2)
      return `${x},${y}`
    })
    .join(" ")

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {data.length > 0 && (
        <circle
          cx={padding + ((data.length - 1) / (data.length - 1)) * (width - padding * 2)}
          cy={height - padding - ((data[data.length - 1] - min) / range) * (height - padding * 2)}
          r="3"
          fill={color}
        />
      )}
    </svg>
  )
}

// Sort helper
type SortKey = "volume" | "edge" | "close_time"
type SortDir = "asc" | "desc"

export default function TradingPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [markets, setMarkets] = useState<Market[]>([])
  const [loadingPortfolio, setLoadingPortfolio] = useState(true)
  const [loadingMarkets, setLoadingMarkets] = useState(true)
  const [marketsError, setMarketsError] = useState("")
  const [expandedMarket, setExpandedMarket] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("volume")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [refreshing, setRefreshing] = useState(false)

  const fetchPortfolio = async () => {
    try {
      const res = await fetch("/api/trading/portfolio")
      if (res.ok) {
        const data = await res.json()
        setPortfolio(data)
      }
    } catch (err) {
      console.error("Portfolio fetch error:", err)
    } finally {
      setLoadingPortfolio(false)
    }
  }

  const fetchMarkets = async () => {
    try {
      setMarketsError("")
      const res = await fetch("/api/trading/markets")
      const data = await res.json()
      if (res.ok && data.markets) {
        setMarkets(data.markets)
      } else {
        setMarketsError(data.error || "Failed to load markets")
      }
    } catch (err) {
      console.error("Markets fetch error:", err)
      setMarketsError("Failed to connect to Kalshi API")
    } finally {
      setLoadingMarkets(false)
    }
  }

  useEffect(() => {
    fetchPortfolio()
    fetchMarkets()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchPortfolio(), fetchMarkets()])
    setRefreshing(false)
  }

  // Computed values
  const startingCapital = 100
  const balance = portfolio?.balance ?? startingCapital
  const pnlPct = ((balance - startingCapital) / startingCapital) * 100
  const goalAmount = portfolio?.goalAmount ?? 20000
  const goalDays = portfolio?.goalDays ?? 90
  const progressPct = Math.min((balance / goalAmount) * 100, 100)

  const dayNumber = useMemo(() => {
    if (!portfolio?.startDate) return 1
    const start = new Date(portfolio.startDate)
    const now = new Date()
    return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  }, [portfolio?.startDate])

  const trades = portfolio?.trades ?? []
  const positions = portfolio?.positions ?? []
  const winCount = trades.filter((t) => t.pnl > 0).length
  const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0
  const totalTradePnl = trades.reduce((sum, t) => sum + t.pnl, 0)
  const dailyPnlData = (portfolio?.dailyLog ?? []).map((d) => d.pnl)

  // Sorted markets
  const sortedMarkets = useMemo(() => {
    const arr = [...markets]
    arr.sort((a, b) => {
      let va: number, vb: number
      if (sortKey === "volume") {
        va = Number(a.volume) || 0
        vb = Number(b.volume) || 0
      } else if (sortKey === "edge") {
        // Edge = spread between bid/ask
        va = a.yes_bid != null && a.yes_ask != null ? Math.abs(a.yes_ask - a.yes_bid) : 999
        vb = b.yes_bid != null && b.yes_ask != null ? Math.abs(b.yes_ask - b.yes_bid) : 999
      } else {
        va = new Date(a.close_time).getTime()
        vb = new Date(b.close_time).getTime()
      }
      return sortDir === "desc" ? vb - va : va - vb
    })
    return arr
  }, [markets, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc")
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="h-3 w-3 opacity-30" />
    return sortDir === "desc" ? (
      <ChevronDown className="h-3 w-3 text-teal-400" />
    ) : (
      <ChevronUp className="h-3 w-3 text-teal-400" />
    )
  }

  if (loadingPortfolio) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-400" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-cyan-400"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Trading Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Paper Trading · Kalshi Prediction Markets
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg glass glass-hover text-sm text-muted-foreground hover:text-white transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Portfolio Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Balance */}
          <Card className="glass border-white/10">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Wallet className="h-4 w-4" /> Balance
                </span>
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    pnlPct >= 0
                      ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                      : "border-red-500/30 text-red-400 bg-red-500/10"
                  }`}
                >
                  {pnlPct >= 0 ? "+" : ""}
                  {pnlPct.toFixed(1)}%
                </Badge>
              </div>
              <p
                className="text-3xl font-bold text-white"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                ${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                from ${startingCapital} starting capital
              </p>
            </CardContent>
          </Card>

          {/* Goal Progress */}
          <Card className="glass border-white/10">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Target className="h-4 w-4" /> Goal
                </span>
                <Badge variant="outline" className="text-xs border-teal-500/30 text-teal-400 bg-teal-500/10">
                  Day {dayNumber} of {goalDays}
                </Badge>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-lg font-semibold text-white">
                  ${balance.toLocaleString()} → ${goalAmount.toLocaleString()}
                </p>
              </div>
              <Progress value={progressPct} className="mt-3 h-2 bg-white/10" />
              <p className="text-xs text-muted-foreground mt-1.5">
                {progressPct.toFixed(2)}% complete
              </p>
            </CardContent>
          </Card>

          {/* Win Rate */}
          <Card className="glass border-white/10">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Activity className="h-4 w-4" /> Win Rate
                </span>
              </div>
              <p
                className="text-3xl font-bold text-white"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {trades.length > 0 ? `${winRate.toFixed(0)}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {trades.length} total trade{trades.length !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>

          {/* Daily P&L Sparkline */}
          <Card className="glass border-white/10">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <LineChart className="h-4 w-4" /> Daily P&L
                </span>
              </div>
              <Sparkline data={dailyPnlData} color={totalTradePnl >= 0 ? "#14b8a6" : "#ef4444"} />
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Panels */}
        <Tabs defaultValue="positions" className="w-full">
          <TabsList className="glass border-white/10 bg-white/5 p-1">
            <TabsTrigger
              value="positions"
              className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-400 data-[state=active]:border-teal-500/30 rounded-md px-4"
            >
              <Crosshair className="h-4 w-4 mr-1.5" />
              Positions
            </TabsTrigger>
            <TabsTrigger
              value="scanner"
              className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-400 data-[state=active]:border-teal-500/30 rounded-md px-4"
            >
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Market Scanner
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-400 data-[state=active]:border-teal-500/30 rounded-md px-4"
            >
              <Clock className="h-4 w-4 mr-1.5" />
              History
            </TabsTrigger>
            <TabsTrigger
              value="log"
              className="data-[state=active]:bg-teal-500/20 data-[state=active]:text-teal-400 data-[state=active]:border-teal-500/30 rounded-md px-4"
            >
              <ScrollText className="h-4 w-4 mr-1.5" />
              Daily Log
            </TabsTrigger>
          </TabsList>

          {/* ACTIVE POSITIONS */}
          <TabsContent value="positions" className="mt-4">
            <Card className="glass border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Crosshair className="h-5 w-5 text-teal-400" />
                  Active Positions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {positions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Crosshair className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm">No active positions</p>
                    <p className="text-xs mt-1 opacity-60">
                      Scan markets below to find your first trade
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead>Market</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead className="text-right">Entry</TableHead>
                        <TableHead className="text-right">Current</TableHead>
                        <TableHead className="text-right">Unrealized P&L</TableHead>
                        <TableHead className="text-right">Resolution</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {positions.map((pos) => {
                        const isWinning = pos.unrealizedPnl >= 0
                        return (
                          <TableRow key={pos.id}>
                            <TableCell className="font-medium text-white max-w-[200px] truncate">
                              {pos.market}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  pos.direction === "YES"
                                    ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                                    : "border-red-500/30 text-red-400 bg-red-500/10"
                                }
                              >
                                {pos.direction}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">${pos.entry.toFixed(2)}</TableCell>
                            <TableCell className="text-right">${pos.current.toFixed(2)}</TableCell>
                            <TableCell
                              className={`text-right font-medium ${
                                isWinning ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {isWinning ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-xs">
                              {new Date(pos.resolutionDate).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* MARKET SCANNER */}
          <TabsContent value="scanner" className="mt-4">
            <Card className="glass border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-teal-400" />
                  Market Scanner
                  <Badge variant="outline" className="text-xs border-white/20 ml-2">
                    {markets.length} markets
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingMarkets ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-400" />
                  </div>
                ) : marketsError ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <BarChart3 className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm text-red-400">{marketsError}</p>
                    <button
                      onClick={fetchMarkets}
                      className="mt-3 text-xs text-teal-400 hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10">
                          <TableHead className="min-w-[250px]">Market</TableHead>
                          <TableHead className="text-right">YES Bid</TableHead>
                          <TableHead className="text-right">YES Ask</TableHead>
                          <TableHead
                            className="text-right cursor-pointer select-none hover:text-white transition-colors"
                            onClick={() => handleSort("volume")}
                          >
                            <span className="inline-flex items-center gap-1">
                              Volume <SortIcon col="volume" />
                            </span>
                          </TableHead>
                          <TableHead
                            className="text-right cursor-pointer select-none hover:text-white transition-colors"
                            onClick={() => handleSort("close_time")}
                          >
                            <span className="inline-flex items-center gap-1">
                              Closes <SortIcon col="close_time" />
                            </span>
                          </TableHead>
                          <TableHead
                            className="text-right cursor-pointer select-none hover:text-white transition-colors"
                            onClick={() => handleSort("edge")}
                          >
                            <span className="inline-flex items-center gap-1">
                              Spread <SortIcon col="edge" />
                            </span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedMarkets.map((m) => {
                          const spread =
                            m.yes_bid != null && m.yes_ask != null
                              ? Math.abs(m.yes_ask - m.yes_bid)
                              : null
                          const isExpanded = expandedMarket === m.ticker
                          return (
                            <>
                              <TableRow
                                key={m.ticker}
                                className="cursor-pointer"
                                onClick={() =>
                                  setExpandedMarket(isExpanded ? null : m.ticker)
                                }
                              >
                                <TableCell className="font-medium text-white max-w-[300px]">
                                  <div className="truncate">{m.title}</div>
                                  {m.category && (
                                    <span className="text-xs text-muted-foreground">
                                      {m.category}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-emerald-400">
                                  {m.yes_bid != null ? `$${m.yes_bid.toFixed(2)}` : "—"}
                                </TableCell>
                                <TableCell className="text-right text-cyan-400">
                                  {m.yes_ask != null ? `$${m.yes_ask.toFixed(2)}` : "—"}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                  {Number(m.volume).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground text-xs">
                                  {new Date(m.close_time).toLocaleDateString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  {spread != null ? (
                                    <Badge
                                      variant="outline"
                                      className={`text-xs ${
                                        spread <= 0.05
                                          ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                                          : spread <= 0.1
                                          ? "border-yellow-500/30 text-yellow-400 bg-yellow-500/10"
                                          : "border-red-500/30 text-red-400 bg-red-500/10"
                                      }`}
                                    >
                                      ${spread.toFixed(2)}
                                    </Badge>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                              </TableRow>
                              {isExpanded && (
                                <TableRow key={`${m.ticker}-detail`}>
                                  <TableCell colSpan={6}>
                                    <div className="p-4 rounded-lg bg-white/5 border border-white/10 space-y-2">
                                      <p className="text-sm text-white font-medium">
                                        {m.title}
                                      </p>
                                      {m.subtitle && (
                                        <p className="text-xs text-muted-foreground">
                                          {m.subtitle}
                                        </p>
                                      )}
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                                        <div>
                                          <p className="text-xs text-muted-foreground">YES Bid/Ask</p>
                                          <p className="text-sm text-white">
                                            ${m.yes_bid?.toFixed(2) ?? "—"} / ${m.yes_ask?.toFixed(2) ?? "—"}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-muted-foreground">NO Bid/Ask</p>
                                          <p className="text-sm text-white">
                                            ${m.no_bid?.toFixed(2) ?? "—"} / ${m.no_ask?.toFixed(2) ?? "—"}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-muted-foreground">Volume</p>
                                          <p className="text-sm text-white">
                                            {Number(m.volume).toLocaleString()}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-xs text-muted-foreground">Closes</p>
                                          <p className="text-sm text-white">
                                            {new Date(m.close_time).toLocaleString()}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-3 p-3 rounded bg-white/5 border border-white/5">
                                        <p className="text-xs text-muted-foreground italic">
                                          Research notes: Click to add notes about this market...
                                        </p>
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TRADE HISTORY */}
          <TabsContent value="history" className="mt-4">
            <Card className="glass border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-teal-400" />
                  Trade History
                  {trades.length > 0 && (
                    <Badge
                      variant="outline"
                      className={`text-xs ml-2 ${
                        totalTradePnl >= 0
                          ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                          : "border-red-500/30 text-red-400 bg-red-500/10"
                      }`}
                    >
                      Total: {totalTradePnl >= 0 ? "+" : ""}${totalTradePnl.toFixed(2)}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trades.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Clock className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm">No completed trades yet</p>
                    <p className="text-xs mt-1 opacity-60">
                      Closed trades will appear here
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10">
                        <TableHead>Market</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead className="text-right">Entry</TableHead>
                        <TableHead className="text-right">Exit</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                        <TableHead className="text-right">Hold Time</TableHead>
                        <TableHead className="text-right">Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trades.map((t, idx) => {
                        const isWin = t.pnl > 0
                        // Running P&L for future use
                        void trades.slice(0, idx + 1).reduce((s, x) => s + x.pnl, 0)
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="font-medium text-white max-w-[200px] truncate">
                              {t.market}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  t.direction === "YES"
                                    ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                                    : "border-red-500/30 text-red-400 bg-red-500/10"
                                }
                              >
                                {t.direction}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">${t.entry.toFixed(2)}</TableCell>
                            <TableCell className="text-right">${t.exit.toFixed(2)}</TableCell>
                            <TableCell
                              className={`text-right font-medium ${
                                isWin ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {isWin ? "+" : ""}${t.pnl.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground text-xs">
                              {t.holdTime || "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  isWin
                                    ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                                    : "border-red-500/30 text-red-400 bg-red-500/10"
                                }`}
                              >
                                {isWin ? (
                                  <TrendingUp className="h-3 w-3 mr-1 inline" />
                                ) : (
                                  <TrendingDown className="h-3 w-3 mr-1 inline" />
                                )}
                                {isWin ? "WIN" : "LOSS"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* DAILY LOG */}
          <TabsContent value="log" className="mt-4">
            <Card className="glass border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ScrollText className="h-5 w-5 text-teal-400" />
                  Daily Trading Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                {portfolio?.dailyLogMd ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-headings:font-serif prose-h1:text-teal-400 prose-h2:text-teal-400/80 prose-h3:text-cyan-400/70 prose-strong:text-white prose-code:text-teal-300 prose-hr:border-white/10">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: simpleMarkdown(portfolio.dailyLogMd),
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <ScrollText className="h-10 w-10 mb-3 opacity-30" />
                    <p className="text-sm">No daily log entries yet</p>
                    <p className="text-xs mt-1 opacity-60">
                      Trading notes from memory/trading-daily-log.md will appear here
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// Simple markdown renderer (no external deps)
function simpleMarkdown(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // HR
    .replace(/^---$/gm, '<hr/>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // Code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // List items
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines
    .replace(/\n/g, '<br/>')
    // Wrap
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
}
