"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Bot, User, Loader2, ImagePlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import Image from "next/image"

interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  created_at: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

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

  useEffect(() => {
    async function loadMessages() {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(100)
      if (data) setMessages(data)
      setInitialLoading(false)
    }
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, scrollToBottom])

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

  // Drag and drop handler
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

  async function sendMessage() {
    const text = input.trim()
    const hasImage = !!pendingImage
    if ((!text && !hasImage) || loading) return

    setInput("")
    setLoading(true)

    // Upload image first if present
    let imageUrl: string | null = null
    if (pendingImage) {
      imageUrl = await uploadImage(pendingImage.file)
      clearPendingImage()
    }

    // Build message content
    let content = text
    if (imageUrl) {
      const imageTag = `[Screenshot uploaded: ${imageUrl}]`
      content = text ? `${text}\n\n${imageTag}` : imageTag
    }

    if (!content) {
      setLoading(false)
      return
    }

    // Optimistic user message
    const tempUserMsg: Message = {
      id: "temp-" + Date.now(),
      role: "user",
      content,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMsg])

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      const data = await res.json()
      if (data.userMessage && data.assistantMessage) {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserMsg.id),
          data.userMessage,
          data.assistantMessage,
        ])
      }
    } catch (error) {
      console.error("Failed to send message:", error)
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id))
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
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
    // Render images inline
    const parts = text.split(/(\[Screenshot uploaded: [^\]]+\])/)
    return parts.map((part) => {
      const match = part.match(/\[Screenshot uploaded: ([^\]]+)\]/)
      if (match) {
        return `<div class="my-2"><img src="${match[1]}" alt="Screenshot" class="max-w-full rounded-lg max-h-[300px] object-contain" /></div>`
      }
      // Basic markdown
      return part
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-black/40 rounded-lg p-3 my-2 overflow-x-auto text-sm"><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code class="bg-black/30 px-1.5 py-0.5 rounded text-sm text-blue-300">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/\n/g, "<br/>")
    }).join("")
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
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-500/30">
            <Bot className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
              Chat with Jacob
            </h1>
            <p className="text-xs text-muted-foreground">Your AI assistant is ready</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">Online</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {initialLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/20 border border-blue-500/30 mb-4">
              <Bot className="h-8 w-8 text-blue-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
              Start a conversation
            </h2>
            <p className="text-muted-foreground max-w-md">
              Ask Jacob anything — search your knowledge base, manage tasks, or just chat.
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
        {loading && (
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
            placeholder={pendingImage ? "Add a message about this image..." : "Message Jacob..."}
            className="min-h-[44px] max-h-[200px] resize-none bg-white/5 border-white/10 text-white placeholder:text-muted-foreground focus:border-blue-500/50"
            rows={1}
          />
          <Button
            onClick={sendMessage}
            disabled={(!input.trim() && !pendingImage) || loading}
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
