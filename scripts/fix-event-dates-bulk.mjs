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

async function fetchAllWPPosts(baseUrl) {
  console.log(`  📥 Downloading all posts from ${baseUrl}...`);
  const allPosts = new Map();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    try {
      const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts?per_page=100&page=${page}&_fields=link,date`);
      if (!res.ok) break;
      
      if (page === 1) {
        totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1');
      }

      const posts = await res.json();
      posts.forEach(p => {
        const cleanLink = p.link.replace(/\/$/, '');
        allPosts.set(cleanLink, p.date.split('T')[0]);
      });

      console.log(`    Page ${page}/${totalPages} loaded...`);
      page++;
      await new Promise(r => setTimeout(r, 1000)); // Polite delay
    } catch (err) {
      console.error(`    ❌ Error on page ${page}: ${err.message}`);
      break;
    }
  }
  return allPosts;
}

async function fixDates() {
  console.log('🚀 Starting BULK Date Correction (AI-Free & Efficient)...');

  // 1. Fetch all posts from both sources in bulk first
  const acodecoPosts = await fetchAllWPPosts('https://www.acodeco.gob.pa/inicio');
  const newsPosts = await fetchAllWPPosts('https://elcapitalfinanciero.com');

  console.log(`✅ Collected ${acodecoPosts.size} ACODECO dates and ${newsPosts.size} News dates.`);

  // 2. Get our local events
  const { data: events, error } = await supabase
    .from('events')
    .select('id, source_url, event_date');

  if (error) {
    console.error('Error fetching events:', error);
    return;
  }

  let updated = 0;
  let skipped = 0;

  console.log(`📊 Processing ${events.length} local records...`);

  for (const event of events) {
    const cleanSource = event.source_url.replace(/\/$/, '');
    let realDate = acodecoPosts.get(cleanSource) || newsPosts.get(cleanSource);

    if (realDate && realDate !== event.event_date) {
      const { error: updateError } = await supabase
        .from('events')
        .update({ event_date: realDate })
        .eq('id', event.id);

      if (!updateError) {
        console.log(`  ✨ Updated: ${event.source_url} → ${realDate}`);
        updated++;
      }
    } else {
      skipped++;
    }
  }

  console.log(`\n🏁 Finished!`);
  console.log(`   Total Updated: ${updated}`);
  console.log(`   Already correct/Not found: ${skipped}`);
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
fixDates().catch(console.error);
