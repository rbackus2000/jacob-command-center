-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'on-hold', 'completed', 'archived')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  tech_stack TEXT[] DEFAULT '{}',
  repo_url TEXT,
  live_url TEXT,
  category TEXT DEFAULT 'safesuites' CHECK (category IN ('safesuites', 'motorola', 'personal', 'other')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed initial projects
INSERT INTO projects (name, description, status, priority, tech_stack, category, progress, notes) VALUES
  (
    'SafeAgent',
    'iOS real estate agent safety app — panic alerts, GPS tracking, Siri voice activation',
    'active',
    'high',
    ARRAY['Swift', 'SwiftUI', 'Firebase'],
    'safesuites',
    75,
    'Core panic alert system complete. Working on Siri integration and background GPS tracking.'
  ),
  (
    'AlertPro (SafeVisits)',
    'Lone worker safety SaaS — pivoting to home health compliance with Apple Watch + Noonlight',
    'active',
    'high',
    ARRAY['Next.js', 'Firebase', 'React'],
    'safesuites',
    40,
    'Pivoting from general lone worker to specialized home health compliance. Apple Watch integration in progress.'
  ),
  (
    'Renderyx.com',
    'AI-powered home transformation app',
    'active',
    'medium',
    ARRAY['Tailwind CSS', 'Next.js'],
    'safesuites',
    80,
    'MVP nearly complete. Working on final AI model fine-tuning for interior design transformations.'
  ),
  (
    'TubeForge',
    'AI YouTube content automation for faceless channels',
    'active',
    'medium',
    ARRAY['Next.js 14', 'Supabase', 'n8n'],
    'personal',
    30,
    'Automation workflows designed. Building content generation pipeline with n8n and AI voice synthesis.'
  ),
  (
    'QuoteCloudly',
    'Cloud-based quoting system',
    'on-hold',
    'low',
    ARRAY['Web platform'],
    'safesuites',
    20,
    'On hold while focusing on higher priority SafeSuites projects. Initial wireframes complete.'
  ),
  (
    'Jacob Command Center',
    'AI operations dashboard — chat, memory, KB, projects',
    'active',
    'high',
    ARRAY['Next.js 14', 'Tailwind', 'Supabase'],
    'personal',
    60,
    'Memory and chat modules complete. Building out projects and knowledge base modules.'
  ),
  (
    'Mission Control',
    'SafeSuites corporate intelligence dashboard',
    'active',
    'medium',
    ARRAY['React', 'Firebase'],
    'safesuites',
    15,
    'Early stage. Planning analytics dashboard for SafeSuites business intelligence.'
  )
ON CONFLICT DO NOTHING;
