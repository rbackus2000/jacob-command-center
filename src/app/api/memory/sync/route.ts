import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// POST: Push memory entries from agent → Supabase
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { entries } = await req.json() as {
    entries: Array<{
      source: string
      content: string
      entry_date: string | null
      tags: string[]
      pinned?: boolean
    }>
  }

  if (!entries?.length) {
    return NextResponse.json({ error: "No entries provided" }, { status: 400 })
  }

  const supabase = createServerClient()

  // Dedup: fetch existing content to avoid duplicates
  const { data: existing } = await supabase
    .from("memory_entries")
    .select("content")

  const existingSet = new Set((existing || []).map(e => e.content.trim()))
  const newEntries = entries.filter(e => !existingSet.has(e.content.trim()))

  if (newEntries.length === 0) {
    return NextResponse.json({ pushed: 0, skipped: entries.length })
  }

  const { data, error } = await supabase
    .from("memory_entries")
    .insert(
      newEntries.map(e => ({
        source: e.source,
        content: e.content,
        entry_date: e.entry_date,
        tags: e.tags || [],
        pinned: e.pinned || false,
      }))
    )
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ pushed: data?.length || 0, skipped: entries.length - newEntries.length })
}

// GET: Pull new dashboard-added entries for agent to pick up
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const since = url.searchParams.get("since") // ISO timestamp
  const source = url.searchParams.get("source") || "manual" // default: manual entries from dashboard

  const supabase = createServerClient()
  let query = supabase
    .from("memory_entries")
    .select("*")
    .eq("source", source)
    .order("created_at", { ascending: false })
    .limit(50)

  if (since) {
    query = query.gt("created_at", since)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ entries: data })
}
