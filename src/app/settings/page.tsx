"use client"

import { motion } from "framer-motion"
import { Settings, Server, Key, Palette } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export default function SettingsPage() {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
          <Settings className="inline h-8 w-8 text-blue-400 mr-3" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">Configure your Jacob Command Center</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-400" /> OpenClaw Gateway
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Gateway URL</label>
              <Input defaultValue="http://127.0.0.1:18789" className="bg-white/5 border-white/10 text-white" readOnly />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Gateway Token</label>
              <Input type="password" defaultValue="will_configure_later" className="bg-white/5 border-white/10 text-white" readOnly />
            </div>
            <Badge variant="secondary">Configuration via .env.local</Badge>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Key className="h-5 w-5 text-blue-400" /> API Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">Supabase</p>
                <p className="text-xs text-muted-foreground">Database & storage</p>
              </div>
              <Badge>Connected</Badge>
            </div>
            <Separator className="bg-white/10" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">OpenAI</p>
                <p className="text-xs text-muted-foreground">Embeddings (text-embedding-3-small)</p>
              </div>
              <Badge>Connected</Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Palette className="h-5 w-5 text-blue-400" /> Appearance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Dark mode is enabled by default. Theme customization coming soon.</p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
