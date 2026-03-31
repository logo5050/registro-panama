/**
 * TEST SCRIPT — Tries Claude Vision on 3 ACODECO edicto PDFs.
 * Run this BEFORE the full backfill to verify extraction works.
 *
 * Expected cost: ~$0.01 (3 PDFs × ~$0.003 each)
 *
 * Usage:
 *   set NODE_TLS_REJECT_UNAUTHORIZED=0
 *   node test-pdf-vision.mjs
 */

import { extractBusinessFromPDF, requireAnthropicKey, logExtractionStats } from './lib/extract-entity.mjs';

const ACODECO_API = 'https://www.acodeco.gob.pa/inicio/wp-json/wp/v2/posts';

/**
 * Extract PDF URL from WordPress post HTML (same logic as backfill script).
 */
function extractPdfUrl(htmlContent) {
  const viewerMatch = htmlContent.match(/[?&]file=([^"'&\s]+\.pdf[^"'&\s]*)/i);
  if (viewerMatch) return decodeURIComponent(viewerMatch[1]);

  const uploadsMatch = htmlContent.match(/(https?:\/\/[^"'\s]+wp-content\/uploads\/[^"'\s]+\.pdf)/i);
  if (uploadsMatch) return uploadsMatch[1];

  return null;
}

function normalizePdfUrl(url) {
  if (url.startsWith('/')) url = `https://www.acodeco.gob.pa${url}`;
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
    return parsed.toString();
  } catch { return url; }
}

async function main() {
  requireAnthropicKey();
  console.log('🧪 TEST: Claude Vision PDF extraction (3 edictos)\n');
  console.log('Expected cost: ~$0.01\n');

  // Fetch recent posts, find ones with PDFs
  const resp = await fetch(`${ACODECO_API}?per_page=30&page=1&orderby=date&order=desc`, {
    headers: { 'User-Agent': 'RegistroPanama/1.0', 'Accept': 'application/json' },
  });
  const posts = await resp.json();

  // Find posts with edicto PDFs
  const edictoPosts = posts.filter(p => {
    const title = (p.title?.rendered || '').toLowerCase();
    const content = p.content?.rendered || '';
    return title.includes('edicto') && extractPdfUrl(content);
  });

  console.log(`Found ${edictoPosts.length} edicto posts with PDFs in first 30 posts.`);
  console.log(`Testing first 3...\n`);

  const testPosts = edictoPosts.slice(0, 3);
  let success = 0;

  for (const post of testPosts) {
    const title = post.title?.rendered || '';
    const rawContent = post.content?.rendered || '';
    const pdfUrl = normalizePdfUrl(extractPdfUrl(rawContent));

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Title: ${title}`);
    console.log(`PDF URL: ${pdfUrl}`);

    // Download PDF
    console.log(`  Downloading PDF...`);
    const pdfResp = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'RegistroPanama/1.0' },
    });

    if (!pdfResp.ok) {
      console.log(`  ❌ Download failed: HTTP ${pdfResp.status}`);
      continue;
    }

    const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer());
    console.log(`  Downloaded: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    // Check it's actually a PDF (starts with %PDF)
    const header = pdfBuffer.slice(0, 5).toString('ascii');
    if (!header.startsWith('%PDF')) {
      console.log(`  ❌ Not a valid PDF (header: "${header}")`);
      continue;
    }
    console.log(`  ✅ Valid PDF detected`);

    // Send to Claude Vision
    console.log(`  Sending to Claude Vision...`);
    const businessName = await extractBusinessFromPDF(title, pdfBuffer);

    if (businessName) {
      console.log(`  ✅ EXTRACTED: "${businessName}"`);
      success++;
    } else {
      console.log(`  ❌ No business name found (NONE)`);
    }
    console.log('');
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n📊 Results: ${success}/${testPosts.length} business names extracted`);
  logExtractionStats();

  if (success > 0) {
    console.log(`\n✅ Vision extraction is WORKING! Safe to run the full backfill.`);
    console.log(`   Run: node backfill-acodeco.mjs`);
  } else {
    console.log(`\n⚠️  No names extracted. Do NOT run the full backfill yet.`);
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
