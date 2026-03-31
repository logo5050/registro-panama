import { createClient } from '@supabase/supabase-js';

// No dotenv - rely on shell environment or hardcoded test
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspect() {
  const { data: events, error } = await supabase
    .from('events')
    .select('summary_es, raw_data')
    .eq('event_type', 'acodeco_infraction')
    .limit(3);

  if (error) {
    console.error(error);
    return;
  }

  events.forEach((e, i) => {
    console.log(`\n--- RECORD ${i+1} ---`);
    console.log(`SUMMARY: ${e.summary_es}`);
    console.log(`RAW: ${JSON.stringify(e.raw_data).substring(0, 500)}...`);
  });
}

inspect();
