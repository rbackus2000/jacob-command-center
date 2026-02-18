#!/usr/bin/env node
/**
 * REST-to-WebSocket bridge for Jacob Command Center
 * Accepts HTTP requests from Vercel, forwards to OpenClaw gateway via local WS
 * Runs on port 18790 alongside the gateway on 18789
 */

const http = require("http")
const { WebSocket } = require("ws")

const PORT = parseInt(process.env.BRIDGE_PORT || "18790")
const GATEWAY_WS = process.env.GATEWAY_WS || "ws://127.0.0.1:18789"
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || ""

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function sendWs(ws, method, params) {
  const id = genId()
  ws.send(JSON.stringify({ type: "req", id, method, params }))
  return id
}

// Create a temporary WS connection, run a task, close
function withGateway(token, task, timeoutMs = 50000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { ws.close(); reject(new Error("Timeout")) }, timeoutMs)
    const ws = new WebSocket(GATEWAY_WS)
    let connected = false

    ws.on("error", (err) => { clearTimeout(timeout); reject(err) })
    ws.on("close", () => { clearTimeout(timeout) })

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString())

        if (msg.type === "event" && msg.event === "connect.challenge") {
          sendWs(ws, "connect", {
            minProtocol: 3, maxProtocol: 3,
            client: { id: "jcc-bridge", version: "1.0.0", platform: "linux", mode: "backend", instanceId: "bridge-" + Date.now() },
            role: "operator", scopes: ["operator.admin"], caps: [],
            auth: { token }, userAgent: "jcc-bridge/1.0"
          })
          return
        }

        if (msg.type === "res" && msg.ok === true && !connected) {
          connected = true
          task(ws, msg, (result) => {
            clearTimeout(timeout)
            ws.close()
            resolve(result)
          }, (err) => {
            clearTimeout(timeout)
            ws.close()
            reject(err)
          })
          return
        }

        if (msg.type === "res" && msg.ok === false && !connected) {
          clearTimeout(timeout); ws.close()
          reject(new Error(msg.error?.message || "Connect failed"))
          return
        }

        // Forward all messages to the task handler
        if (connected && ws._onMsg) ws._onMsg(msg)
      } catch (e) { /* ignore parse errors */ }
    })
  })
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (c) => body += c)
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")) } catch { resolve({}) }
    })
    req.on("error", reject)
  })
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return }

  // Auth check
  const auth = req.headers.authorization?.replace("Bearer ", "")
  if (!BRIDGE_TOKEN || auth !== BRIDGE_TOKEN) {
    res.writeHead(401, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "Unauthorized" }))
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  try {
    // GET /health
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // GET /history?sessionKey=...&limit=...
    if (url.pathname === "/history" && req.method === "GET") {
      const sessionKey = url.searchParams.get("sessionKey") || "agent:main:main"
      const limit = parseInt(url.searchParams.get("limit") || "100")
      const gwToken = url.searchParams.get("gwToken") || ""

      const messages = await withGateway(gwToken, (ws, _connMsg, resolve, reject) => {
        const histId = sendWs(ws, "chat.history", { sessionKey, limit })
        ws._onMsg = (msg) => {
          if (msg.type === "res" && msg.id === histId) {
            if (msg.ok) {
              const msgs = Array.isArray(msg.payload?.messages) ? msg.payload.messages : Array.isArray(msg.payload) ? msg.payload : []
              resolve(msgs)
            } else {
              reject(new Error(msg.error?.message || "History failed"))
            }
          }
        }
      })

      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ messages }))
      return
    }

    // POST /chat { content, sessionKey, gwToken }
    if (url.pathname === "/chat" && req.method === "POST") {
      const body = await parseBody(req)
      const { content, sessionKey = "agent:main:main", gwToken = "" } = body

      if (!content) {
        res.writeHead(400, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ error: "content required" }))
        return
      }

      const result = await withGateway(gwToken, (ws, _connMsg, resolve, reject) => {
        let sentChat = false
        let histId = null

        // Send the chat message
        sendWs(ws, "chat.send", { sessionKey, message: content, idempotencyKey: genId() })
        sentChat = true

        ws._onMsg = (msg) => {
          // Wait for final state
          if (msg.type === "event" && msg.event === "chat" && msg.payload?.state === "final") {
            setTimeout(() => {
              histId = sendWs(ws, "chat.history", { sessionKey, limit: 5 })
            }, 500)
            return
          }

          // History response
          if (msg.type === "res" && msg.id === histId && msg.ok === true) {
            const messages = Array.isArray(msg.payload?.messages) ? msg.payload.messages : Array.isArray(msg.payload) ? msg.payload : []
            for (let i = messages.length - 1; i >= 0; i--) {
              const m = messages[i]
              if (m.role === "assistant") {
                let text = ""
                if (typeof m.content === "string") text = m.content
                else if (Array.isArray(m.content)) text = m.content.filter(b => b.type === "text").map(b => b.text).join("")
                resolve({ content: text }); return
              }
            }
            resolve({ content: "No response received." })
            return
          }

          if (msg.type === "res" && msg.ok === false && sentChat) {
            reject(new Error(msg.error?.message || "Chat failed"))
          }
        }
      })

      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ success: true, ...result }))
      return
    }

    res.writeHead(404, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: "Not found" }))
  } catch (err) {
    console.error("Bridge error:", err.message)
    res.writeHead(500, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ error: err.message }))
  }
})

server.listen(PORT, "0.0.0.0", () => {
  console.log(`JCC Bridge running on port ${PORT}`)
})
