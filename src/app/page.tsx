"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  MessageSquare,
  Upload,
  Search,
  Brain,
  CheckCircle2,
  Clock,
  FileText,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

const quickActions = [
  { label: "Chat with Jacob", href: "/chat", icon: MessageSquare, color: "from-blue-500 to-blue-600" },
  { label: "Upload Documents", href: "/knowledge", icon: Upload, color: "from-purple-500 to-purple-600" },
  { label: "Search Knowledge", href: "/knowledge", icon: Search, color: "from-emerald-500 to-emerald-600" },
  { label: "View Memory", href: "/memory", icon: Brain, color: "from-amber-500 to-amber-600" },
]

const services = [
  { name: "Telegram", status: "connected" as const, emoji: "💬" },
  { name: "Git", status: "connected" as const, emoji: "🔀" },
  { name: "Google Drive", status: "connected" as const, emoji: "📁" },
  { name: "OpenClaw Gateway", status: "connected" as const, emoji: "🤖" },
]

interface ChatMessage {
  id: string
  role: string
  content: string
  created_at: string
}

interface Document {
  id: string
  name: string
  status: string
  created_at: string
  file_type: string
}

export default function DashboardPage() {
  const [recentMessages, setRecentMessages] = useState<ChatMessage[]>([])
  const [recentDocs, setRecentDocs] = useState<Document[]>([])
  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      const { data: messages } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5)
      if (messages) setRecentMessages(messages)

      const { data: docs } = await supabase
        .from("documents")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5)
      if (docs) setRecentDocs(docs)
    }
    loadData()
  }, [])

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Welcome */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl lg:text-4xl font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
          {getGreeting()}, <span className="text-gradient">Robert</span>
        </h1>
        <p className="text-muted-foreground mt-2">Here&apos;s what&apos;s happening with your AI assistant.</p>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {quickActions.map((action) => (
          <Link key={action.label} href={action.href}>
            <Card className="glass glass-hover cursor-pointer group">
              <CardContent className="p-4 flex flex-col items-center gap-3 text-center">
                <div className={`rounded-xl p-3 bg-gradient-to-br ${action.color} shadow-lg group-hover:scale-110 transition-transform`}>
                  <action.icon className="h-6 w-6 text-white" />
                </div>
                <span className="text-sm font-medium text-white">{action.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </motion.div>

      {/* Status Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-white text-lg">Connected Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {services.map((service) => (
                <div key={service.name} className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                  <span className="text-2xl">{service.emoji}</span>
                  <div>
                    <p className="text-sm font-medium text-white">{service.name}</p>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-400" />
                      <span className="text-xs text-green-400">Connected</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Messages */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="glass">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white text-lg">Recent Messages</CardTitle>
              <Link href="/chat">
                <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300">
                  View all
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentMessages.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No messages yet. <Link href="/chat" className="text-blue-400 hover:underline">Start a conversation</Link>
                </p>
              ) : (
                recentMessages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${msg.role === "user" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
                      {msg.role === "user" ? "R" : "J"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{msg.content}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Documents */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card className="glass">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white text-lg">Recent Documents</CardTitle>
              <Link href="/knowledge">
                <Button variant="ghost" size="sm" className="text-blue-400 hover:text-blue-300">
                  View all
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentDocs.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No documents yet. <Link href="/knowledge" className="text-blue-400 hover:underline">Upload some</Link>
                </p>
              ) : (
                recentDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{doc.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(doc.created_at).toLocaleString()}
                      </span>
                    </div>
                    <Badge variant={doc.status === "ready" ? "default" : doc.status === "error" ? "destructive" : "secondary"}>
                      {doc.status}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
