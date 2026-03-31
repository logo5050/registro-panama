import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function debug() {
  console.log('Checking database for ACODECO related data...\n');

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
    console.log('Event types distribution:', counts);
  }

  // 2. Check for "acodeco" in summaries
  const { data: mentions, error: mentionError } = await supabase
    .from('events')
    .select('event_type, summary_es')
    .ilike('summary_es', '%acodeco%')
    .limit(5);

  if (mentionError) {
    console.error('Error fetching acodeco mentions:', mentionError);
  } else {
    console.log(`\nFound ${mentions.length} events mentioning "acodeco" in summary_es.`);
    mentions.forEach(m => {
      console.log(`- Type: ${m.event_type} | Summary: ${m.summary_es.substring(0, 50)}...`);
    });
  }

  // 3. Test the exact query that's failing
  const { data: biz, error: bizError } = await supabase
    .from('businesses')
    .select('name, events!inner(event_type)')
    .eq('events.event_type', 'acodeco_infraction')
    .limit(1);

  if (bizError) {
    console.log('\nQuery for acodeco_infraction failed:', bizError.message);
  } else {
    console.log(`\nDirect query for acodeco_infraction found ${biz.length} businesses.`);
  }
}

debug();
