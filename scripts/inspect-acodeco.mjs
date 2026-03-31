import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspectAcodecoData() {
  console.log('🔍 Inspecting ACODECO Infraction Content...\n');

  const { data: events, error } = await supabase
    .from('events')
    .select('summary_es, raw_data')
    .eq('event_type', 'acodeco_infraction')
    .limit(5);

  if (error) {
    console.error('Error fetching events:', error.message);
    return;
  }

  events.forEach((event, i) => {
    console.log(`--- Record #${i + 1} ---`);
    console.log('Summary:', event.summary_es);
    console.log('Raw Data Snippet:', JSON.stringify(event.raw_data).substring(0, 300));
    console.log('\n');
  });
}

inspectAcodecoData();
