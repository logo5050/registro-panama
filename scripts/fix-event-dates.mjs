import { createClient } from '@supabase/supabase-js';

// Using standard process.env (assuming .env.local is already loaded or we are in a context that provides them)
// Since we are running via node, we might need a simple way to read the file if not in environment.
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

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixDates() {
  console.log('🔍 Starting Date-Only Correction (AI-Free)...');

  // 1. Get all events that have a source URL
  const { data: events, error } = await supabase
    .from('events')
    .select('id, source_url, event_date');

  if (error) {
    console.error('Error fetching events:', error);
    return;
  }

  console.log(`📊 Found ${events.length} events to check.`);

  let updated = 0;
  let skipped = 0;

  for (const event of events) {
    let realDate = null;

    try {
      if (event.source_url.includes('acodeco.gob.pa')) {
        const apiUrl = `https://www.acodeco.gob.pa/inicio/wp-json/wp/v2/posts?search=${encodeURIComponent(event.source_url)}`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          const posts = await res.json();
          // WordPress search is broad, find the exact match
          const match = posts.find(p => {
             const cleanLink = p.link.replace(/\/$/, '');
             const cleanSource = event.source_url.replace(/\/$/, '');
             return cleanLink === cleanSource;
          });
          if (match) {
            realDate = match.date.split('T')[0];
          }
        }
      } else if (event.source_url.includes('elcapitalfinanciero.com')) {
        const apiUrl = `https://elcapitalfinanciero.com/wp-json/wp/v2/posts?search=${encodeURIComponent(event.source_url)}`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          const posts = await res.json();
          const match = posts.find(p => {
             const cleanLink = p.link.replace(/\/$/, '');
             const cleanSource = event.source_url.replace(/\/$/, '');
             return cleanLink === cleanSource;
          });
          if (match) {
            realDate = match.date.split('T')[0];
          }
        }
      }

      if (realDate && realDate !== event.event_date) {
        const { error: updateError } = await supabase
          .from('events')
          .update({ event_date: realDate })
          .eq('id', event.id);

        if (updateError) {
          console.error(`  ❌ Failed to update event ${event.id}:`, updateError.message);
        } else {
          console.log(`  ✅ Updated: ${event.source_url} → ${realDate}`);
          updated++;
        }
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`  ⚠️ Error processing ${event.source_url}:`, err.message);
      skipped++;
    }

    // Be polite
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n✅ Finished!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

fixDates().catch(console.error);
