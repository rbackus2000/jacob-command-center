import { Settings, Server, Key, Palette } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

function maskToken(token: string): string {
  if (!token || token.length < 8) return "••••••••"
  return token.slice(0, 4) + "••••••••" + token.slice(-4)
}

export default function SettingsPage() {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || "Not configured"
  const gatewayToken = maskToken(process.env.OPENCLAW_GATEWAY_TOKEN || "")
  const hasGateway = !!process.env.OPENCLAW_GATEWAY_URL

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
          <Settings className="inline h-8 w-8 text-blue-400 mr-3" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">Configure your Jacob Command Center</p>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-400" /> OpenClaw Gateway
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Gateway URL</label>
            <Input defaultValue={gatewayUrl} className="bg-white/5 border-white/10 text-white" readOnly />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Gateway Token</label>
            <Input defaultValue={gatewayToken} className="bg-white/5 border-white/10 text-white font-mono" readOnly />
          </div>
          <Badge variant={hasGateway ? "default" : "destructive"}>
            {hasGateway ? "Configured via Environment" : "Not Configured"}
          </Badge>
        </CardContent>
      </Card>

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
    </div>
  )
}
