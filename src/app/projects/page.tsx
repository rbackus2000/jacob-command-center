"use client"

import { motion } from "framer-motion"
import { FolderKanban, Plus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function ProjectsPage() {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
            <FolderKanban className="inline h-8 w-8 text-blue-400 mr-3" />
            Projects
          </h1>
          <p className="text-muted-foreground mt-1">Manage your projects and tasks</p>
        </div>
        <Button className="bg-blue-500 hover:bg-blue-600">
          <Plus className="h-4 w-4 mr-2" /> New Project
        </Button>
      </motion.div>

      <Card className="glass">
        <CardContent className="p-8 text-center">
          <FolderKanban className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg text-white font-medium mb-2">Projects coming soon</h3>
          <p className="text-muted-foreground">Project management integration is under development.</p>
        </CardContent>
      </Card>
    </div>
  )
}
