#!/usr/bin/env node
/**
 * Sync chat history from OpenClaw Gateway to Supabase
 * Pulls conversations from all agent sessions and upserts into chat_messages table
 * 
 * Usage: GATEWAY_TOKEN=xxx SUPABASE_URL=xxx SUPABASE_KEY=xxx node sync-chat-history.js
 * Or via cron / API endpoint
 */

const { createClient } = require("@supabase/supabase-js")

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const GATEWAY_WS = process.env.GATEWAY_WS || "ws://127.0.0.1:18789"
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN

const AGENTS = [
  { id: "main", name: "Jacob", sessionKey: "agent:main:main" },
  { id: "elon-musk", name: "Elon Musk", sessionKey: "agent:elon-musk:main" },
  { id: "ray-dalio", name: "Ray Dalio", sessionKey: "agent:ray-dalio:main" },
  { id: "lawrence-yun", name: "Lawrence Yun", sessionKey: "agent:lawrence-yun:main" },
  { id: "dario-amodei", name: "Dario Amodei", sessionKey: "agent:dario-amodei:main" },
  { id: "anton-osika", name: "Anton Osika", sessionKey: "agent:anton-osika:main" },
]

const { WebSocket } = require("ws")

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function fetchHistory(sessionKey, limit = 200) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { ws.close(); reject(new Error("Timeout")) }, 30000)
    const ws = new WebSocket(GATEWAY_WS)
    let connected = false
    let histId = null

    ws.on("error", (err) => { clearTimeout(timeout); reject(err) })
    
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString())

        if (msg.type === "event" && msg.event === "connect.challenge") {
          const id = genId()
          ws.send(JSON.stringify({
            type: "req", id, method: "connect",
            params: {
              minProtocol: 3, maxProtocol: 3,
              client: { id: "gateway-client", version: "1.0.0", platform: "linux", mode: "backend", instanceId: "sync-" + Date.now() },
              role: "operator", scopes: ["operator.admin"], caps: [],
              auth: { token: GATEWAY_TOKEN }, userAgent: "jcc-sync/1.0"
            }
          }))
          return
        }

        if (msg.type === "res" && msg.ok === true && !connected) {
          connected = true
          histId = genId()
          ws.send(JSON.stringify({
            type: "req", id: histId, method: "chat.history",
            params: { sessionKey, limit }
          }))
          return
        }

        if (msg.type === "res" && msg.id === histId) {
          clearTimeout(timeout)
          ws.close()
          if (msg.ok) {
            const messages = Array.isArray(msg.payload?.messages) ? msg.payload.messages : []
            resolve(messages)
          } else {
            reject(new Error(msg.error?.message || "History failed"))
          }
          return
        }

        if (msg.type === "res" && msg.ok === false && !connected) {
          clearTimeout(timeout); ws.close()
          reject(new Error(msg.error?.message || "Connect failed"))
        }
      } catch (e) { /* ignore */ }
    })
  })
}

function extractText(content) {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === "text")
      .map(b => b.text || "")
      .join("")
  }
  return ""
}

async function syncAgent(supabase, agent) {
  try {
    const messages = await fetchHistory(agent.sessionKey)
    if (!messages.length) {
      console.log(`  ${agent.name}: no messages`)
      return 0
    }

    let synced = 0
    for (const msg of messages) {
      if (msg.role !== "user" && msg.role !== "assistant") continue // only sync user and assistant
      
      const text = extractText(msg.content)
      if (!text || text === "HEARTBEAT_OK" || text === "NO_REPLY") continue
      // Skip heartbeat prompts
      if (text.startsWith("Read HEARTBEAT.md")) continue
      // Skip memory flush prompts
      if (text.startsWith("Pre-compaction memory flush")) continue

      const ts = msg.timestamp
        ? new Date(typeof msg.timestamp === "number" ? (msg.timestamp > 1e12 ? msg.timestamp : msg.timestamp * 1000) : msg.timestamp).toISOString()
        : new Date().toISOString()

      // Create a deterministic ID from sessionKey + timestamp + role to avoid duplicates
      const dedupKey = `${agent.sessionKey}:${ts}:${msg.role}`

      // Check if already exists
      const { data: existing } = await supabase
        .from("chat_messages")
        .select("id")
        .eq("metadata->>dedupKey", dedupKey)
        .limit(1)

      if (existing && existing.length > 0) continue

      const { error } = await supabase.from("chat_messages").insert({
        role: msg.role,
        content: text,
        created_at: ts,
        metadata: {
          sessionKey: agent.sessionKey,
          agentId: agent.id,
          agentName: agent.name,
          dedupKey,
          source: "gateway-sync",
        },
      })

      if (error) {
        console.error(`  Error inserting for ${agent.name}:`, error.message)
      } else {
        synced++
      }
    }

    console.log(`  ${agent.name}: ${synced} new messages synced (${messages.length} total in gateway)`)
    return synced
  } catch (err) {
    console.error(`  ${agent.name}: ERROR - ${err.message}`)
    return 0
  }
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !GATEWAY_TOKEN) {
    console.error("Missing env vars: SUPABASE_URL, SUPABASE_KEY, GATEWAY_TOKEN")
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  console.log("Syncing chat history from Gateway to Supabase...")

  let totalSynced = 0
  for (const agent of AGENTS) {
    totalSynced += await syncAgent(supabase, agent)
  }

  console.log(`Done. ${totalSynced} total new messages synced.`)
}

main().catch(console.error)
