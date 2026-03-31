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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function inspect() {
  const { data: events, error } = await supabase
    .from('events')
    .select('summary_es, raw_data')
    .eq('event_type', 'acodeco_infraction')
    .limit(5);

  if (error) {
    console.error(error);
    return;
  }

  events.forEach((e, i) => {
    console.log(`\n--- RECORD ${i+1} ---`);
    console.log(`SUMMARY: ${e.summary_es}`);
    console.log(`RAW SNIPPET: ${JSON.stringify(e.raw_data).substring(0, 300)}...`);
  });
}

inspect();
