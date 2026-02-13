"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  FolderKanban,
  Plus,
  ExternalLink,
  Github,
  Loader2,
  Edit,
  Archive,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
// Progress bar rendered manually with div
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"

interface Project {
  id: string
  name: string
  description: string | null
  status: "active" | "on-hold" | "completed" | "archived"
  priority: "high" | "medium" | "low"
  tech_stack: string[]
  repo_url: string | null
  live_url: string | null
  category: "safesuites" | "motorola" | "personal" | "other"
  progress: number
  notes: string | null
  created_at: string
  updated_at: string
}

type ProjectFormData = Omit<Project, "id" | "created_at" | "updated_at">

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [formData, setFormData] = useState<Partial<ProjectFormData>>({
    name: "",
    description: "",
    status: "active",
    priority: "medium",
    tech_stack: [],
    category: "safesuites",
    progress: 0,
    notes: "",
    repo_url: "",
    live_url: "",
  })
  const [techInput, setTechInput] = useState("")
  const supabase = createClient()

  async function loadProjects() {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })
    if (data) setProjects(data)
    setLoading(false)
  }

  useEffect(() => {
    loadProjects()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredProjects = projects.filter((p) =>
    selectedCategory === "all" ? true : p.category === selectedCategory
  )

  async function saveProject() {
    if (!formData.name?.trim()) return

    const projectData = {
      ...formData,
      tech_stack: formData.tech_stack || [],
    }

    if (editingProject) {
      await supabase.from("projects").update(projectData).eq("id", editingProject.id)
    } else {
      await supabase.from("projects").insert(projectData)
    }

    resetForm()
    loadProjects()
  }

  async function archiveProject(id: string) {
    await supabase.from("projects").update({ status: "archived" }).eq("id", id)
    setExpandedId(null)
    loadProjects()
  }

  function resetForm() {
    setFormData({
      name: "",
      description: "",
      status: "active",
      priority: "medium",
      tech_stack: [],
      category: "safesuites",
      progress: 0,
      notes: "",
      repo_url: "",
      live_url: "",
    })
    setTechInput("")
    setEditingProject(null)
    setDialogOpen(false)
  }

  function openEditDialog(project: Project) {
    setEditingProject(project)
    setFormData({
      name: project.name,
      description: project.description || "",
      status: project.status,
      priority: project.priority,
      tech_stack: project.tech_stack || [],
      category: project.category,
      progress: project.progress,
      notes: project.notes || "",
      repo_url: project.repo_url || "",
      live_url: project.live_url || "",
    })
    setTechInput((project.tech_stack || []).join(", "))
    setDialogOpen(true)
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "active":
        return "bg-green-500/20 text-green-300 border-green-500/30"
      case "on-hold":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
      case "completed":
        return "bg-blue-500/20 text-blue-300 border-blue-500/30"
      case "archived":
        return "bg-gray-500/20 text-gray-300 border-gray-500/30"
      default:
        return "bg-white/10 text-white border-white/20"
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case "high":
        return "bg-red-500"
      case "medium":
        return "bg-yellow-500"
      case "low":
        return "bg-gray-500"
      default:
        return "bg-white/20"
    }
  }

  function getProgressColor(progress: number) {
    if (progress >= 80) return "from-green-500 to-emerald-500"
    if (progress >= 50) return "from-blue-500 to-cyan-500"
    if (progress >= 25) return "from-yellow-500 to-orange-500"
    return "from-red-500 to-pink-500"
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1
            className="text-3xl font-bold text-white"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            <FolderKanban className="inline h-8 w-8 text-blue-400 mr-3" />
            Projects
          </h1>
          <p className="text-muted-foreground mt-1">
            Track and manage your active projects
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-500 hover:bg-blue-600" onClick={() => resetForm()}>
              <Plus className="h-4 w-4 mr-2" /> Add Project
            </Button>
          </DialogTrigger>
          <DialogContent className="glass max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white">
                {editingProject ? "Edit Project" : "Add New Project"}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {editingProject
                  ? "Update your project details"
                  : "Create a new project to track"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm text-white mb-2 block">Project Name *</label>
                <Input
                  placeholder="e.g., SafeAgent"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-white mb-2 block">Description</label>
                <Textarea
                  placeholder="Brief description of the project"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="bg-white/5 border-white/10 text-white min-h-[80px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-white mb-2 block">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as Project["status"],
                      })
                    }
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white"
                  >
                    <option value="active">Active</option>
                    <option value="on-hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-white mb-2 block">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        priority: e.target.value as Project["priority"],
                      })
                    }
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-white mb-2 block">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        category: e.target.value as Project["category"],
                      })
                    }
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-white"
                  >
                    <option value="safesuites">SafeSuites</option>
                    <option value="motorola">Motorola</option>
                    <option value="personal">Personal</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-white mb-2 block">
                    Progress ({formData.progress}%)
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={formData.progress}
                    onChange={(e) =>
                      setFormData({ ...formData, progress: parseInt(e.target.value) })
                    }
                    className="w-full"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-white mb-2 block">Tech Stack</label>
                <Input
                  placeholder="e.g., Next.js, React, Supabase (comma-separated)"
                  value={techInput}
                  onChange={(e) => {
                    setTechInput(e.target.value)
                    setFormData({
                      ...formData,
                      tech_stack: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-white mb-2 block">Repository URL</label>
                <Input
                  placeholder="https://github.com/..."
                  value={formData.repo_url}
                  onChange={(e) =>
                    setFormData({ ...formData, repo_url: e.target.value })
                  }
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-white mb-2 block">Live URL</label>
                <Input
                  placeholder="https://..."
                  value={formData.live_url}
                  onChange={(e) =>
                    setFormData({ ...formData, live_url: e.target.value })
                  }
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <label className="text-sm text-white mb-2 block">Notes</label>
                <Textarea
                  placeholder="Internal notes about the project"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="bg-white/5 border-white/10 text-white min-h-[100px]"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={saveProject}
                  className="flex-1 bg-blue-500 hover:bg-blue-600"
                >
                  {editingProject ? "Update Project" : "Create Project"}
                </Button>
                <Button
                  onClick={resetForm}
                  variant="outline"
                  className="border-white/10 hover:bg-white/5"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>

      <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
        <TabsList className="glass border border-white/10">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="safesuites">SafeSuites</TabsTrigger>
          <TabsTrigger value="motorola">Motorola</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="other">Other</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card className="glass">
          <CardContent className="p-8 text-center">
            <FolderKanban className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg text-white font-medium mb-2">No projects yet</h3>
            <p className="text-muted-foreground">
              {selectedCategory === "all"
                ? "Create your first project to get started"
                : `No ${selectedCategory} projects found`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-4">
            {filteredProjects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card
                  className={`glass hover:border-blue-500/30 transition-all cursor-pointer ${
                    expandedId === project.id ? "border-blue-500/50" : ""
                  }`}
                  onClick={() =>
                    setExpandedId(expandedId === project.id ? null : project.id)
                  }
                >
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <div
                          className={`w-2 h-2 rounded-full ${getPriorityColor(
                            project.priority
                          )}`}
                        />
                        <h3 className="text-lg font-semibold text-white truncate">
                          {project.name}
                        </h3>
                      </div>
                      {expandedId === project.id ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {project.description || "No description"}
                    </p>

                    <div className="flex gap-2 flex-wrap">
                      <Badge className={getStatusColor(project.status)} variant="outline">
                        {project.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs border-white/20">
                        {project.category}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span className="font-medium">{project.progress}%</span>
                      </div>
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full bg-gradient-to-r ${getProgressColor(
                            project.progress
                          )} transition-all`}
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>

                    {project.tech_stack && project.tech_stack.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {project.tech_stack.slice(0, 3).map((tech) => (
                          <Badge
                            key={tech}
                            variant="secondary"
                            className="text-xs bg-white/5"
                          >
                            {tech}
                          </Badge>
                        ))}
                        {project.tech_stack.length > 3 && (
                          <Badge variant="secondary" className="text-xs bg-white/5">
                            +{project.tech_stack.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    <AnimatePresence>
                      {expandedId === project.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-white/10 pt-3 space-y-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {project.notes && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Notes
                              </p>
                              <p className="text-sm text-white/80 whitespace-pre-wrap">
                                {project.notes}
                              </p>
                            </div>
                          )}

                          {project.tech_stack && project.tech_stack.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">Tech Stack</p>
                              <div className="flex gap-1 flex-wrap">
                                {project.tech_stack.map((tech) => (
                                  <Badge
                                    key={tech}
                                    variant="secondary"
                                    className="text-xs bg-white/5"
                                  >
                                    {tech}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2 flex-wrap">
                            {project.repo_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-white/10 hover:bg-white/5"
                                onClick={() => window.open(project.repo_url!, "_blank")}
                              >
                                <Github className="h-3 w-3 mr-1" />
                                Repository
                              </Button>
                            )}
                            {project.live_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs border-white/10 hover:bg-white/5"
                                onClick={() => window.open(project.live_url!, "_blank")}
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Live Site
                              </Button>
                            )}
                          </div>

                          <div className="flex gap-2 pt-2 border-t border-white/10">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 border-white/10 hover:bg-white/5"
                              onClick={() => openEditDialog(project)}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            {project.status !== "archived" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 border-white/10 hover:bg-red-500/10 text-red-400"
                                onClick={() => archiveProject(project.id)}
                              >
                                <Archive className="h-3 w-3 mr-1" />
                                Archive
                              </Button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
