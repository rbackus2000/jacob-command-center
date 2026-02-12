import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .order("created_at")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ collections: data })
}

export async function POST(req: NextRequest) {
  const { name, description, icon } = await req.json()
  const supabase = createServerClient()

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("collections")
    .insert({ name, description: description || null, icon: icon || "📁" })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ collection: data })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const supabase = createServerClient()

  const { error } = await supabase.from("collections").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
