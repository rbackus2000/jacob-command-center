#!/bin/bash
cd /root/.openclaw/workspace/jacob-command-center
export SUPABASE_URL="https://vhcdvvxlzbgghcvjrrsq.supabase.co"
export SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoY2R2dnhsemJnZ2hjdmpycnNxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDg2MTI0NiwiZXhwIjoyMDg2NDM3MjQ2fQ.yxj1-trGCYt4Hhe8twNJTWRr8ApDSFXDlHNpjFPYkYA"
export GATEWAY_TOKEN="$(grep OPENCLAW_GATEWAY_TOKEN .env.local | cut -d= -f2)"
node scripts/sync-chat-history.js >> /tmp/jcc-chat-sync.log 2>&1
