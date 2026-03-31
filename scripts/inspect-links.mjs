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
  console.log('📊 Checking Business-Event Links...\n');
  
  const { data, error } = await supabase
    .from('events')
    .select(`
      summary_es,
      businesses (
        name
      )
    `)
    .eq('event_type', 'acodeco_infraction')
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  data.forEach((e, i) => {
    console.log(`[${i+1}] Business: ${e.businesses?.name || 'UNKNOWN'} | Summary: ${e.summary_es}`);
  });
}

inspect();
