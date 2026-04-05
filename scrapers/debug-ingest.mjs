/**
 * Debug script to test the Ingest API and database connection.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const API_URL = process.env.INGEST_API_URL || 'http://localhost:3000/api/ingest-event';
const SECRET = process.env.INGEST_SECRET;

async function testIngest() {
  console.log('🧪 Testing Ingest API...');
  console.log(`🔗 URL: ${API_URL}`);
  console.log(`🔑 Secret: ${SECRET ? 'SET (starts with ' + SECRET.substring(0, 4) + '...)' : 'MISSING'}`);

  if (!SECRET) {
    console.error('❌ Error: INGEST_SECRET is not set in environment or .env.local');
    return;
  }

  const testEvent = {
    name: "DEBUG TEST BUSINESS",
    category: "Debug",
    event_type: "acodeco_open_data",
    event_date: new Date().toISOString().split('T')[0],
    source_url: "https://example.com/debug",
    summary_es: "Evento de prueba para depuración.",
    summary_en: "Debug test event.",
    raw_data: { debug: true }
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SECRET}`,
      },
      body: JSON.stringify(testEvent),
    });

    const status = res.status;
    const body = await res.json().catch(() => null);

    if (res.ok) {
      console.log(`✅ Success! (Status ${status})`);
      console.log('Response:', body);
    } else {
      console.error(`❌ Failed! (Status ${status})`);
      console.error('Error Details:', JSON.stringify(body, null, 2));
      
      if (status === 500) {
        console.log('\n💡 Analysis: A 500 error usually means:');
        console.log('   1. The database migration 006 was not applied to the DB the API is using.');
        console.log('   2. The Supabase service role key is invalid.');
        console.log('   3. The API is hitting a different database than you expect.');
      }
    }
  } catch (err) {
    console.error('💥 Connection Error:', err.message);
    if (err.message.includes('fetch failed')) {
      console.log('\n💡 Analysis: Could not connect to the API. Is your Next.js server running?');
    }
  }
}

testIngest();
