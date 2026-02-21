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

const GATEWAY_URL = process.env.NEXT_PUBLIC_OPENCLAW_GATEWAY_WS_URL || ""
const GATEWAY_TOKEN = process.env.NEXT_PUBLIC_OPENCLAW_GATEWAY_TOKEN || ""

let msgCounter = 0

export default function ChatPage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent>(AGENTS[0])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingRpc = useRef<Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>>(new Map())
  const currentRunId = useRef<string | null>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        })
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
      const id = ++msgCounter
      pendingRpc.current.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
      // Timeout after 60s
      setTimeout(() => {
        if (pendingRpc.current.has(id)) {
          pendingRpc.current.delete(id)
          reject(new Error("RPC timeout"))
        }
      }, 60000)
    })
  }, [])

  // --- Connect WebSocket ---
  const connectWs = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    const wsUrl = GATEWAY_URL.replace(/^http/, "ws")
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      // Authenticate
      ws.send(JSON.stringify({
        id: ++msgCounter,
        method: "connect",
        params: { auth: { token: GATEWAY_TOKEN } }
      }))
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        // Handle RPC responses
        if (data.id && pendingRpc.current.has(data.id)) {
          const { resolve, reject } = pendingRpc.current.get(data.id)!
          pendingRpc.current.delete(data.id)
          if (data.error) {
            reject(new Error(data.error.message || JSON.stringify(data.error)))
          } else {
            resolve(data.result)
          }
          return
        }

        // Handle chat events (streaming responses)
        if (data.method === "chat" || data.event === "chat") {
          const payload = data.params || data
          if (payload.sessionKey !== selectedAgent.sessionKey) return

          if (payload.type === "partial" || payload.type === "delta") {
            // Streaming content
            setStreamingContent((prev) => prev + (payload.delta || payload.content || ""))
          } else if (payload.type === "final" || payload.type === "message") {
            // Final message
            const content = payload.content || payload.text || ""
            if (content && payload.role === "assistant") {
              setStreamingContent("")
              setMessages((prev) => [
                ...prev,
                {
                  id: payload.id || `ws-${Date.now()}`,
                  role: "assistant",
                  content,
                  created_at: new Date().toISOString(),
                },
              ])
              setLoading(false)
              currentRunId.current = null
            }
          } else if (payload.type === "done" || payload.type === "end") {
            // Run finished — if we have streaming content, commit it
            if (currentRunId.current) {
              setStreamingContent((prev) => {
                if (prev) {
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
            }
          }
        }

        // Handle agent events 
        if (data.method === "agent" || data.event === "agent") {
          const payload = data.params || data
          if (payload.type === "reply" && payload.content) {
            setStreamingContent("")
            setMessages((prev) => [
              ...prev,
              {
                id: payload.id || `ws-${Date.now()}`,
                role: "assistant",
                content: payload.content,
                created_at: new Date().toISOString(),
              },
            ])
            setLoading(false)
            currentRunId.current = null
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    ws.onclose = () => {
      setConnected(false)
      // Reconnect after 3s
      setTimeout(connectWs, 3000)
    }

    ws.onerror = () => {
      setConnected(false)
    }
  }, [selectedAgent.sessionKey])

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

  // Connect WS on mount
  useEffect(() => {
    connectWs()
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null // prevent reconnect on unmount
        wsRef.current.close()
      }
    }
  }, [connectWs])

  // Load history when connected or agent changes
  useEffect(() => {
    if (connected) {
      setInitialLoading(true)
      loadHistory()
    }
  }, [connected, loadHistory])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, streamingContent, scrollToBottom])

  // Paste handler for images
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) {
            setPendingImage({ file, preview: URL.createObjectURL(file) })
          }
          return
        }
      }
    }
    document.addEventListener("paste", handlePaste)
    return () => document.removeEventListener("paste", handlePaste)
  }, [])

  const [dragOver, setDragOver] = useState(false)

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
      if (data.url) return data.url
      console.error("Upload error:", data.error)
      return null
    } catch (err) {
      console.error("Upload failed:", err)
      return null
    } finally {
      setUploading(false)
    }
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
    // Reconnect WS to pick up new agent's events
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }
    wsRef.current = null
    // Will reconnect via useEffect
  }

  async function sendMessage() {
    const text = input.trim()
    const hasImage = !!pendingImage
    if ((!text && !hasImage) || loading) return

    setInput("")
    setLoading(true)
    setStreamingContent("")

    // Upload image first if present
    let imageUrl: string | null = null
    if (pendingImage) {
      imageUrl = await uploadImage(pendingImage.file)
      clearPendingImage()
    }

    let content = text
    if (imageUrl) {
      const imageTag = `[Screenshot uploaded: ${imageUrl}]`
      content = text ? `${text}\n\n${imageTag}` : imageTag
    }

    if (!content) {
      setLoading(false)
      return
    }

    // Add user message optimistically
    const tempUserMsg: Message = {
      id: "temp-" + Date.now(),
      role: "user",
      content,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMsg])

    try {
      const result = await rpc("chat.send", {
        sessionKey: selectedAgent.sessionKey,
        content,
      }) as { runId?: string; status?: string }

      if (result?.runId) {
        currentRunId.current = result.runId
      }

      // If status is already "ok" with no runId, the response might come synchronously
      // The streaming events will handle the response
    } catch (error) {
      console.error("Failed to send:", error)
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `⚠️ Failed to send message: ${error instanceof Error ? error.message : "Unknown error"}`,
          created_at: new Date().toISOString(),
        },
      ])
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
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
    return parts
      .map((part) => {
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
      })
      .join("")
  }

  return (
    <div
      className="flex flex-col h-full"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
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
            <p className="text-xs text-muted-foreground">Direct Gateway WebSocket connection</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {connected ? (
              <>
                <Wifi className="h-4 w-4 text-green-400" />
                <span className="text-xs text-green-400">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-red-400" />
                <span className="text-xs text-red-400">Reconnecting...</span>
              </>
            )}
          </div>
        </div>

        {/* Agent Selector */}
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

        {/* Streaming response */}
        {streamingContent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 border border-blue-500/30">
              <Bot className="h-4 w-4 text-blue-400" />
            </div>
            <div
              className="max-w-[85%] sm:max-w-[70%] glass rounded-2xl rounded-bl-md px-4 py-3 text-sm text-white break-words overflow-hidden"
              dangerouslySetInnerHTML={{ __html: renderContent(streamingContent) }}
            />
          </motion.div>
        )}

        {/* Loading dots */}
        {loading && !streamingContent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
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

      {/* Pending image preview */}
      {pendingImage && (
        <div className="border-t border-white/10 bg-black/20 px-4 pt-3">
          <div className="relative inline-block">
            <Image
              src={pendingImage.preview}
              alt="Pending upload"
              width={120}
              height={120}
              className="rounded-lg object-cover h-[80px] w-auto"
              unoptimized
            />
            <button
              onClick={clearPendingImage}
              className="absolute -top-2 -right-2 bg-red-500 rounded-full p-0.5 hover:bg-red-600 transition-colors"
            >
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 text-muted-foreground hover:text-blue-400"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
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
