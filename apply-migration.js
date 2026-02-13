const fs = require('fs');
const https = require('https');

const SUPABASE_URL = 'https://vhcdvvxlzbgghcvjrrsq.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoY2R2dnhsemJnZ2hjdmpycnNxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDg2MTI0NiwiZXhwIjoyMDg2NDM3MjQ2fQ.yxj1-trGCYt4Hhe8twNJTWRr8ApDSFXDlHNpjFPYkYA';

// Read the migration file
const sql = fs.readFileSync('./supabase/migrations/20260213_create_projects.sql', 'utf8');

// Split SQL into individual statements (simple approach)
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

console.log(`Executing ${statements.length} SQL statements...`);

async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query: sql });
    
    const options = {
      hostname: 'vhcdvvxlzbgghcvjrrsq.supabase.co',
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Try using pg_query extension via PostgREST
// Note: This approach may not work if the extension isn't available
// In that case, the migration must be applied manually via Supabase dashboard

console.log('Note: This script attempts to use Supabase RPC, but may require manual SQL execution.');
console.log('If the table creation fails, please:');
console.log('1. Go to Supabase Dashboard → SQL Editor');
console.log('2. Paste the contents of supabase/migrations/20260213_create_projects.sql');
console.log('3. Click "Run"');
console.log('\nAttempting automatic execution...\n');

// Since we can't guarantee RPC access, let's just save the SQL for manual execution
console.log('Migration SQL ready at: supabase/migrations/20260213_create_projects.sql');
console.log('\nPlease apply this migration manually in the Supabase dashboard.');
