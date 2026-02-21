"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Bot, User, Loader2, ImagePlus, X, WifiOff, Wifi } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import Image from "next/image"

interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  created_at: string
}

interface Agent {
  id: string
  name: string
  emoji: string
  sessionKey: string
}

const AGENTS: Agent[] = [
  { id: "main", name: "Jacob", emoji: "🧠", sessionKey: "agent:main:main" },
  { id: "elon-musk", name: "Elon", emoji: "🚀", sessionKey: "agent:elon-musk:main" },
  { id: "ray-dalio", name: "Ray", emoji: "📊", sessionKey: "agent:ray-dalio:main" },
  { id: "lawrence-yun", name: "Lawrence", emoji: "🏠", sessionKey: "agent:lawrence-yun:main" },
  { id: "dario-amodei", name: "Dario", emoji: "🧠", sessionKey: "agent:dario-amodei:main" },
  { id: "anton-osika", name: "Anton", emoji: "⚡", sessionKey: "agent:anton-osika:main" },
]

const GATEWAY_WS_URL = process.env.NEXT_PUBLIC_OPENCLAW_GATEWAY_WS_URL || ""
const GATEWAY_TOKEN = process.env.NEXT_PUBLIC_OPENCLAW_GATEWAY_TOKEN || ""

let msgCounter = 0

export default function ChatPage() {
  const [mounted, setMounted] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<Agent>(AGENTS[0])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingRpc = useRef<Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>>(new Map())
  const currentRunId = useRef<string | null>(null)
  const selectedAgentRef = useRef(selectedAgent)

  // Hydration guard
  useEffect(() => { setMounted(true) }, [])

  // Keep ref in sync
  useEffect(() => {
    selectedAgentRef.current = selectedAgent
  }, [selectedAgent])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
      }
    })
  }, [])

  // --- WebSocket RPC helper ---
  const rpc = useCallback((method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"))
        return
      }
      const id = String(++msgCounter)
      pendingRpc.current.set(id, { resolve, reject })
      ws.send(JSON.stringify({ type: "req", id, method, params }))
      setTimeout(() => {
        if (pendingRpc.current.has(id)) {
          pendingRpc.current.delete(id)
          reject(new Error("RPC timeout"))
        }
      }, 60000)
    })
  }, [])

  // --- Handle incoming WS events ---
  const handleChatEvent = useCallback((payload: Record<string, unknown>) => {
    const agent = selectedAgentRef.current
    if (payload.sessionKey && payload.sessionKey !== agent.sessionKey) return

    console.log("[WS] Chat/Agent event:", payload.type, payload)

    const type = payload.type as string

    if (type === "partial" || type === "delta") {
      const delta = (payload.delta || payload.content || "") as string
      setStreamingContent((prev) => prev + delta)
    } else if (type === "final" || type === "message") {
      const content = (payload.content || payload.text || "") as string
      if (content && payload.role === "assistant") {
        setStreamingContent("")
        setMessages((prev) => [
          ...prev,
          {
            id: (payload.id as string) || `ws-${Date.now()}`,
            role: "assistant",
            content,
            created_at: new Date().toISOString(),
          },
        ])
        setLoading(false)
        currentRunId.current = null
      }
    } else if (type === "done" || type === "end") {
      setStreamingContent((prev) => {
        if (prev && currentRunId.current) {
          setMessages((msgs) => [
            ...msgs,
            {
              id: `ws-${Date.now()}`,
              role: "assistant",
              content: prev,
              created_at: new Date().toISOString(),
            },
          ])
        }
        return ""
      })
      setLoading(false)
      currentRunId.current = null
    } else if (type === "reply") {
      const content = (payload.content || "") as string
      if (content) {
        setStreamingContent("")
        setMessages((prev) => [
          ...prev,
          {
            id: (payload.id as string) || `ws-${Date.now()}`,
            role: "assistant",
            content,
            created_at: new Date().toISOString(),
          },
        ])
        setLoading(false)
        currentRunId.current = null
      }
    }
  }, [])

  // --- Connect WebSocket ---
  const connectWs = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    // Convert https:// to wss:// if needed
    let wsUrl = GATEWAY_WS_URL
    if (wsUrl.startsWith("https://")) wsUrl = "wss://" + wsUrl.slice(8)
    else if (wsUrl.startsWith("http://")) wsUrl = "ws://" + wsUrl.slice(7)
    if (!wsUrl.startsWith("ws")) wsUrl = "wss://" + wsUrl

    console.log("[WS] Connecting to", wsUrl)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("[WS] Socket open, waiting for challenge...")
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        // Handle connect challenge
        if (data.type === "event" && data.event === "connect.challenge") {
          console.log("[WS] Got challenge, sending connect request...")
          const connectId = String(++msgCounter)
          pendingRpc.current.set(connectId, {
            resolve: () => {
              console.log("[WS] Authenticated!")
              setConnected(true)
            },
            reject: (err: Error) => {
              console.error("[WS] Auth failed:", err)
              setConnected(false)
            },
          })
          ws.send(JSON.stringify({
            type: "req",
            id: connectId,
            method: "connect",
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: "openclaw-control-ui",
                version: "1.0.0",
                platform: "web",
                mode: "webchat",
              },
              role: "operator",
              scopes: ["operator.read", "operator.write"],
              caps: [],
              commands: [],
              permissions: {},
              auth: { token: GATEWAY_TOKEN },
              locale: "en-US",
              userAgent: "jacob-command-center/1.0.0",
            },
          }))
          return
        }

        // Handle RPC responses
        if (data.type === "res" && data.id) {
          const id = String(data.id)
          if (pendingRpc.current.has(id)) {
            const { resolve, reject } = pendingRpc.current.get(id)!
            pendingRpc.current.delete(id)
            if (data.ok === false || data.error) {
              reject(new Error(data.error?.message || data.payload?.message || JSON.stringify(data.error || data.payload)))
            } else {
              resolve(data.payload || data.result)
            }
            return
          }
        }

        // Handle streaming events
        if (data.type === "event" && (data.event === "chat" || data.event === "agent")) {
          const payload = data.payload || data.params || {}
          handleChatEvent(payload)
          return
        }
      } catch (err) {
        console.error("[WS] Parse error:", err)
      }
    }

    ws.onclose = (e) => {
      console.log("[WS] Closed:", e.code, e.reason)
      setConnected(false)
      setTimeout(connectWs, 3000)
    }

    ws.onerror = (err) => {
      console.error("[WS] Error:", err)
      setConnected(false)
    }
  }, [handleChatEvent])

  // --- Load history via WS RPC ---
  const loadHistory = useCallback(async () => {
    try {
      const result = await rpc("chat.history", {
        sessionKey: selectedAgent.sessionKey,
        limit: 100,
      }) as { messages?: Array<{ id: string; role: string; content: string; ts?: string; timestamp?: string }> }

      if (result?.messages && Array.isArray(result.messages)) {
        const mapped: Message[] = result.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id || `hist-${Math.random()}`,
            role: m.role as "user" | "assistant",
            content: m.content,
            created_at: m.ts || m.timestamp || new Date().toISOString(),
          }))
        setMessages(mapped)
      }
    } catch (err) {
      console.error("Failed to load history:", err)
    } finally {
      setInitialLoading(false)
    }
  }, [rpc, selectedAgent.sessionKey])

  // Connect on mount (only after hydration)
  useEffect(() => {
    if (!mounted) return
    connectWs()
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [connectWs, mounted])

  // Load history when connected
  useEffect(() => {
    if (connected && mounted) {
      setInitialLoading(true)
      loadHistory()
    }
  }, [connected, loadHistory])

  useEffect(() => { scrollToBottom() }, [messages, loading, streamingContent, scrollToBottom])

  // Paste handler for images
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) setPendingImage({ file, preview: URL.createObjectURL(file) })
          return
        }
      }
    }
    document.addEventListener("paste", handlePaste)
    return () => document.removeEventListener("paste", handlePaste)
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith("image/")) {
      setPendingImage({ file, preview: URL.createObjectURL(file) })
    }
  }

  async function uploadImage(file: File): Promise<string | null> {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/chat/upload", { method: "POST", body: formData })
      const data = await res.json()
      return data.url || null
    } catch { return null } finally { setUploading(false) }
  }

  function clearPendingImage() {
    if (pendingImage) {
      URL.revokeObjectURL(pendingImage.preview)
      setPendingImage(null)
    }
  }

  function handleAgentChange(agent: Agent) {
    setSelectedAgent(agent)
    setMessages([])
    setStreamingContent("")
    setInitialLoading(true)
  }

  async function sendMessage() {
    const text = input.trim()
    const hasImage = !!pendingImage
    if ((!text && !hasImage) || loading) return

    setInput("")
    setLoading(true)
    setStreamingContent("")

    let imageUrl: string | null = null
    if (pendingImage) {
      imageUrl = await uploadImage(pendingImage.file)
      clearPendingImage()
    }

    let content = text
    if (imageUrl) {
      const tag = `[Screenshot uploaded: ${imageUrl}]`
      content = text ? `${text}\n\n${tag}` : tag
    }
    if (!content) { setLoading(false); return }

    // Optimistic user message
    setMessages((prev) => [
      ...prev,
      { id: "temp-" + Date.now(), role: "user", content, created_at: new Date().toISOString() },
    ])

    try {
      const result = await rpc("chat.send", {
        sessionKey: selectedAgent.sessionKey,
        content,
      }) as { runId?: string }

      if (result?.runId) {
        currentRunId.current = result.runId
      }
    } catch (error) {
      console.error("Send failed:", error)
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `⚠️ ${error instanceof Error ? error.message : "Failed to send"}`,
          created_at: new Date().toISOString(),
        },
      ])
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file?.type.startsWith("image/")) {
      setPendingImage({ file, preview: URL.createObjectURL(file) })
    }
    e.target.value = ""
  }

  function renderContent(text: string) {
    const parts = text.split(/(\[Screenshot uploaded: [^\]]+\])/)
    return parts.map((part) => {
      const match = part.match(/\[Screenshot uploaded: ([^\]]+)\]/)
      if (match) {
        return `<div class="my-2"><img src="${match[1]}" alt="Screenshot" class="max-w-full rounded-lg max-h-[300px] object-contain" /></div>`
      }
      return part
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-black/40 rounded-lg p-3 my-2 overflow-x-auto text-sm"><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code class="bg-black/30 px-1.5 py-0.5 rounded text-sm text-blue-300">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br/>")
    }).join("")
  }

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="absolute inset-0 z-50 bg-blue-500/10 border-2 border-dashed border-blue-400 rounded-xl flex items-center justify-center backdrop-blur-sm">
          <div className="text-center">
            <ImagePlus className="h-12 w-12 text-blue-400 mx-auto mb-2" />
            <p className="text-blue-400 font-medium">Drop image here</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-white/10 bg-black/20 backdrop-blur-xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-500/30 text-2xl">
            {selectedAgent.emoji}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
              Chat with {selectedAgent.name}
            </h1>
            <p className="text-xs text-muted-foreground">Direct Gateway connection</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {connected ? (
              <><Wifi className="h-4 w-4 text-green-400" /><span className="text-xs text-green-400">Connected</span></>
            ) : (
              <><WifiOff className="h-4 w-4 text-red-400" /><span className="text-xs text-red-400">Reconnecting...</span></>
            )}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {AGENTS.map((agent) => (
            <button
              key={agent.id}
              onClick={() => handleAgentChange(agent)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all ${
                selectedAgent.id === agent.id
                  ? "bg-blue-500 text-white border border-blue-400"
                  : "glass text-white/70 hover:text-white hover:bg-white/10 border border-white/10"
              }`}
            >
              <span className="text-base">{agent.emoji}</span>
              <span className="text-sm font-medium">{agent.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {initialLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          </div>
        ) : messages.length === 0 && !streamingContent ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20 border border-blue-500/30 mb-4 text-4xl">
              {selectedAgent.emoji}
            </div>
            <h2 className="text-xl font-semibold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
              Start a conversation
            </h2>
            <p className="text-muted-foreground max-w-md">
              Ask {selectedAgent.name} anything. Messages sync with Telegram in real-time.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role !== "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-500/30">
                    <Bot className="h-4 w-4 text-blue-400" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 text-sm break-words overflow-hidden ${
                    msg.role === "user"
                      ? "bg-blue-500 text-white rounded-br-md"
                      : "glass text-white rounded-bl-md"
                  }`}
                  dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
                />
                {msg.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/30">
                    <User className="h-4 w-4 text-blue-300" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {streamingContent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-500/30">
              <Bot className="h-4 w-4 text-blue-400" />
            </div>
            <div
              className="max-w-[85%] sm:max-w-[70%] glass rounded-2xl rounded-bl-md px-4 py-3 text-sm text-white break-words overflow-hidden"
              dangerouslySetInnerHTML={{ __html: renderContent(streamingContent) }}
            />
          </motion.div>
        )}

        {loading && !streamingContent && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-500/30">
              <Bot className="h-4 w-4 text-blue-400" />
            </div>
            <div className="glass rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <div className="h-2 w-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="h-2 w-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="h-2 w-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {pendingImage && (
        <div className="border-t border-white/10 bg-black/20 px-4 pt-3">
          <div className="relative inline-block">
            <Image src={pendingImage.preview} alt="Pending" width={120} height={120} className="rounded-lg object-cover h-[80px] w-auto" unoptimized />
            <button onClick={clearPendingImage} className="absolute -top-2 -right-2 bg-red-500 rounded-full p-0.5 hover:bg-red-600 transition-colors">
              <X className="h-3 w-3 text-white" />
            </button>
            {uploading && (
              <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-white/10 bg-black/20 backdrop-blur-xl p-4">
        <div className="flex gap-3 items-end max-w-4xl mx-auto">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
          <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground hover:text-blue-400" onClick={() => fileInputRef.current?.click()} disabled={loading}>
            <ImagePlus className="h-5 w-5" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingImage ? "Add a message about this image..." : `Message ${selectedAgent.name}...`}
            className="min-h-[44px] max-h-[200px] resize-none bg-white/5 border-white/10 text-white placeholder:text-muted-foreground focus:border-blue-500/50"
            rows={1}
          />
          <Button
            onClick={sendMessage}
            disabled={(!input.trim() && !pendingImage) || loading || !connected}
            size="icon"
            className="h-11 w-11 shrink-0 bg-blue-500 hover:bg-blue-600"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-2">
          📎 Paste, drag & drop, or click the image icon to upload screenshots
        </p>
      </div>
    </div>
  )
}
