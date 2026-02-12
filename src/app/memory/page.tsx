"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Brain, Pin, PinOff, Plus, Tag, Calendar, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

interface MemoryEntry {
  id: string
  source: string
  content: string
  entry_date: string | null
  tags: string[]
  pinned: boolean
  created_at: string
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newContent, setNewContent] = useState("")
  const [newSource, setNewSource] = useState("manual")
  const [newTags, setNewTags] = useState("")
  const supabase = createClient()

  async function loadEntries() {
    const { data } = await supabase
      .from("memory_entries")
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
    if (data) setEntries(data)
    setLoading(false)
  }

  useEffect(() => { loadEntries() }, [])

  async function addEntry() {
    if (!newContent.trim()) return
    const tags = newTags.split(",").map(t => t.trim()).filter(Boolean)
    await supabase.from("memory_entries").insert({
      source: newSource,
      content: newContent,
      entry_date: new Date().toISOString().split("T")[0],
      tags,
    })
    setNewContent("")
    setNewTags("")
    setDialogOpen(false)
    loadEntries()
  }

  async function togglePin(id: string, pinned: boolean) {
    await supabase.from("memory_entries").update({ pinned: !pinned }).eq("id", id)
    loadEntries()
  }

  async function deleteEntry(id: string) {
    await supabase.from("memory_entries").delete().eq("id", id)
    loadEntries()
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
            <Brain className="inline h-8 w-8 text-blue-400 mr-3" />
            Memory
          </h1>
          <p className="text-muted-foreground mt-1">Jacob&apos;s long-term memory and notes</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-500 hover:bg-blue-600">
              <Plus className="h-4 w-4 mr-2" /> Add Memory
            </Button>
          </DialogTrigger>
          <DialogContent className="glass">
            <DialogHeader>
              <DialogTitle className="text-white">Add Memory Entry</DialogTitle>
              <DialogDescription className="text-muted-foreground">Add a new memory for Jacob to remember.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <Input
                placeholder="Source (e.g., manual, conversation, observation)"
                value={newSource}
                onChange={(e) => setNewSource(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
              <Textarea
                placeholder="What should Jacob remember?"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="bg-white/5 border-white/10 text-white min-h-[100px]"
              />
              <Input
                placeholder="Tags (comma-separated)"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
              />
              <Button onClick={addEntry} className="w-full bg-blue-500 hover:bg-blue-600">Save Memory</Button>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /></div>
      ) : entries.length === 0 ? (
        <Card className="glass">
          <CardContent className="p-8 text-center">
            <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg text-white font-medium mb-2">No memories yet</h3>
            <p className="text-muted-foreground">Add memories manually or they&apos;ll be synced from MEMORY.md</p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-3 pr-4">
            {entries.map((entry, i) => (
              <motion.div key={entry.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className={`glass ${entry.pinned ? "border-blue-500/30" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-white whitespace-pre-wrap">{entry.content}</p>
                        <div className="flex items-center gap-3 mt-3 flex-wrap">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {entry.entry_date || new Date(entry.created_at).toLocaleDateString()}
                          </span>
                          <Badge variant="outline" className="text-xs">{entry.source}</Badge>
                          {entry.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />{tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => togglePin(entry.id, entry.pinned)}>
                          {entry.pinned ? <PinOff className="h-4 w-4 text-blue-400" /> : <Pin className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400" onClick={() => deleteEntry(entry.id)}>
                          <span className="text-xs">×</span>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
