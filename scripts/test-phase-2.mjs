import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

async function testIntake() {
  console.log('🧪 Testing Intake API...');
  const response = await fetch(`${BASE_URL}/api/ingest/multimedia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      social_handle: '@consumidor_pma',
      complaint_text: 'Compré un televisor en Tienda X y no quieren hacerme válida la garantía a pesar de que solo han pasado 2 meses.',
      evidence_urls: ['https://example.com/receipt.jpg']
    })
  });

  const data = await response.json();
  console.log('Intake Response:', JSON.stringify(data, null, 2));
  return data.report_id;
}

async function testAudit(reportId) {
  if (!reportId) return;
  console.log('\n🧪 Testing Audit API...');
  const response = await fetch(`${BASE_URL}/api/reports/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_id: reportId })
  });

  const data = await response.json();
  console.log('Audit Response:', JSON.stringify(data, null, 2));
}

async function runTests() {
  try {
    const reportId = await testIntake();
    await testAudit(reportId);
  } catch (err) {
    console.error('Test Failed:', err.message);
  }
}

runTests();
