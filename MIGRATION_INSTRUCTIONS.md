# Projects Table Migration Instructions

## ⚠️ Manual Migration Required

The projects table migration file has been created but needs to be applied manually to Supabase.

### Steps to Apply Migration:

1. **Go to Supabase SQL Editor**
   - URL: https://supabase.com/dashboard/project/vhcdvvxlzbgghcvjrrsq/sql/new

2. **Open the migration file**
   - Location: `supabase/migrations/20260213_create_projects.sql`

3. **Copy the entire SQL content and paste into SQL Editor**

4. **Click "Run"**

### What the Migration Includes:

✅ **Projects table** with full schema:
- id (UUID, primary key)
- name, description
- status (active, on-hold, completed, archived)
- priority (high, medium, low)
- tech_stack (array of strings)
- repo_url, live_url
- category (safesuites, motorola, personal, other)
- progress (0-100)
- notes
- created_at, updated_at (with auto-update trigger)

✅ **Seed data** for 7 projects:
- SafeAgent (75% complete)
- AlertPro/SafeVisits (40% complete)
- Renderyx.com (80% complete)
- TubeForge (30% complete)
- QuoteCloudly (20% complete, on-hold)
- Jacob Command Center (60% complete)
- Mission Control (15% complete)

### Verify Migration Success:

After running the migration, test the Projects page:
```bash
npm run dev
```

Then navigate to: http://localhost:3000/projects

You should see all 7 projects displayed in a filterable grid with:
- Status badges (color-coded)
- Priority indicators
- Progress bars
- Tech stack tags
- Category filters (All, SafeSuites, Motorola, Personal)
- Full CRUD functionality (Add, Edit, Archive)

---

**Alternative: Using Supabase CLI**

If you have the Supabase CLI installed:
```bash
supabase db push
```

This will automatically apply all pending migrations.
