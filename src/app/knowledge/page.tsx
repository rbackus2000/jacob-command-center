"use client"

import { useEffect, useState, useCallback } from "react"
import { motion } from "framer-motion"
import {
  Upload,
  Search,
  FileText,
  Plus,
  FolderOpen,
  Loader2,
  X,
  File,
  // Trash2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

interface Collection {
  id: string
  name: string
  description: string | null
  icon: string
  created_at: string
}

interface Document {
  id: string
  collection_id: string | null
  name: string
  file_type: string
  file_size: number
  status: string
  created_at: string
}

interface SearchResult {
  id: string
  content: string
  similarity: number
  document_id: string
  document_name?: string
}

export default function KnowledgePage() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState("")
  const [newCollectionDesc, setNewCollectionDesc] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const supabase = createClient()

  const loadData = useCallback(async () => {
    const { data: cols } = await supabase.from("collections").select("*").order("created_at")
    if (cols) setCollections(cols)

    let query = supabase.from("documents").select("*").order("created_at", { ascending: false })
    if (selectedCollection) query = query.eq("collection_id", selectedCollection)
    const { data: docs } = await query
    if (docs) setDocuments(docs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollection])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function createCollection() {
    if (!newCollectionName.trim()) return
    await fetch("/api/knowledge/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCollectionName, description: newCollectionDesc }),
    })
    setNewCollectionName("")
    setNewCollectionDesc("")
    setDialogOpen(false)
    loadData()
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append("file", file)
      if (selectedCollection) formData.append("collection_id", selectedCollection)
      await fetch("/api/knowledge/upload", { method: "POST", body: formData })
    }
    setUploading(false)
    loadData()
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          collection_id: selectedCollection,
        }),
      })
      const data = await res.json()
      setSearchResults(data.results || [])
    } catch {
      console.error("Search failed")
    }
    setSearching(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    handleFileUpload(e.dataTransfer.files)
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  }

  return (
    <div className="flex h-screen">
      {/* Collections Sidebar */}
      <div className="w-64 border-r border-white/10 bg-black/20 backdrop-blur-xl flex flex-col">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Collections</h2>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-white">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="glass">
                <DialogHeader>
                  <DialogTitle className="text-white">New Collection</DialogTitle>
                  <DialogDescription className="text-muted-foreground">Create a new collection to organize your documents.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <Input
                    placeholder="Collection name"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                  />
                  <Input
                    placeholder="Description (optional)"
                    value={newCollectionDesc}
                    onChange={(e) => setNewCollectionDesc(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                  />
                  <Button onClick={createCollection} className="w-full bg-blue-500 hover:bg-blue-600">
                    Create Collection
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            <button
              onClick={() => setSelectedCollection(null)}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                !selectedCollection ? "bg-blue-500/20 text-blue-400" : "text-muted-foreground hover:bg-white/5 hover:text-white"
              }`}
            >
              <FolderOpen className="h-4 w-4" />
              All Documents
            </button>
            {collections.map((col) => (
              <button
                key={col.id}
                onClick={() => setSelectedCollection(col.id)}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  selectedCollection === col.id ? "bg-blue-500/20 text-blue-400" : "text-muted-foreground hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>{col.icon}</span>
                <span className="truncate">{col.name}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <div className="flex gap-2 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search your knowledge base..."
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground"
              />
            </div>
            <Button onClick={handleSearch} disabled={searching} className="bg-blue-500 hover:bg-blue-600">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Search Results */}
          {searchResults.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Search Results
                </h2>
                <Button variant="ghost" size="sm" onClick={() => setSearchResults([])} className="text-muted-foreground">
                  <X className="h-4 w-4 mr-1" /> Clear
                </Button>
              </div>
              <div className="space-y-3">
                {searchResults.map((result) => (
                  <Card key={result.id} className="glass">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm text-white whitespace-pre-wrap">{result.content}</p>
                          {result.document_name && (
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              Source: {result.document_name}
                            </p>
                          )}
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {(result.similarity * 100).toFixed(0)}% match
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Separator className="my-6 bg-white/10" />
            </motion.div>
          )}

          {/* Upload Zone */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragOver ? "border-blue-400 bg-blue-500/10" : "border-white/20 hover:border-white/40"
              }`}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 text-blue-400 animate-spin" />
                  <p className="text-sm text-white">Processing files...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-white font-medium">Drop files here or click to upload</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports PDF, TXT, MD, DOCX, CSV, JSON
                    </p>
                  </div>
                  <label>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.txt,.md,.docx,.csv,.json"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e.target.files)}
                    />
                    <Button variant="outline" className="cursor-pointer border-white/20 text-white hover:bg-white/10" asChild>
                      <span>Choose Files</span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          </motion.div>

          {/* Document List */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
              Documents {selectedCollection && collections.find(c => c.id === selectedCollection) && `in ${collections.find(c => c.id === selectedCollection)!.name}`}
            </h2>
            {documents.length === 0 ? (
              <Card className="glass">
                <CardContent className="p-8 text-center">
                  <File className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No documents yet. Upload some files to get started.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <Card key={doc.id} className="glass glass-hover">
                    <CardContent className="p-4 flex items-center gap-4">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.file_type} • {formatFileSize(doc.file_size)} • {new Date(doc.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge
                        variant={doc.status === "ready" ? "default" : doc.status === "error" ? "destructive" : "secondary"}
                      >
                        {doc.status === "processing" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        {doc.status}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
