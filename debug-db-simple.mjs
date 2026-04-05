import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, 'utf8');
      envFile.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        }
      });
    }
  } catch (e) {}
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debug() {
  console.log('🔍 Checking database for ACODECO related data...\n');

  // 1. Check event types distribution
  const { data: types, error: typeError } = await supabase
    .from('events')
    .select('event_type');

  if (typeError) {
    console.error('Error fetching event types:', typeError);
  } else {
    const counts = {};
    types.forEach(t => {
      counts[t.event_type] = (counts[t.event_type] || 0) + 1;
    });
    console.log('Event types distribution (Full):', JSON.stringify(counts, null, 2));
  }

  // 2. Test a flexible search
  const { data: biz, error: bizError } = await supabase
    .from('businesses')
    .select('name, events!inner(event_type, summary_es)')
    .or('event_type.eq.acodeco_infraction,summary_es.ilike.%acodeco%', { foreignTable: 'events' })
    .limit(5);

  if (bizError) {
    console.log('\n❌ Query failed:', bizError.message);
  } else {
    console.log(`\n✅ Found ${biz.length} businesses matching ACODECO search.`);
  }
}

debug();
