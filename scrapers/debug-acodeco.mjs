/**
 * Debug script — inspects 5 ACODECO edicto posts to understand their structure.
 * Run: set NODE_TLS_REJECT_UNAUTHORIZED=0 && node debug-acodeco.mjs
 */

const ACODECO_API = 'https://www.acodeco.gob.pa/inicio/wp-json/wp/v2/posts';

async function main() {
  console.log('🔍 Fetching 5 recent ACODECO posts to inspect structure...\n');

  const resp = await fetch(`${ACODECO_API}?per_page=5&page=1&orderby=date&order=desc`, {
    headers: {
      'User-Agent': 'RegistroPanama/1.0',
      'Accept': 'application/json',
    },
  });

  const posts = await resp.json();

  for (const post of posts) {
    const title = post.title?.rendered || '(no title)';
    const rawContent = post.content?.rendered || '(empty)';
    const excerpt = post.excerpt?.rendered || '(no excerpt)';

    console.log('='.repeat(80));
    console.log('TITLE:', title);
    console.log('DATE:', post.date);
    console.log('LINK:', post.link);
    console.log('');

    // Show raw HTML content (first 1000 chars)
    console.log('RAW HTML CONTENT (first 1000 chars):');
    console.log(rawContent.substring(0, 1000));
    console.log('');

    // Show text-stripped content
    const textContent = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log('TEXT CONTENT (stripped HTML, first 500 chars):');
    console.log(textContent.substring(0, 500));
    console.log('');

    // Show excerpt
    console.log('EXCERPT:', excerpt.substring(0, 300));
    console.log('');

    // Find all URLs in the content
    const urls = [...rawContent.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(m => m[1]);
    console.log('ALL URLs IN CONTENT:');
    urls.forEach(u => console.log('  →', u));
    console.log('');

    // Find PDF-like URLs specifically
    const pdfUrls = urls.filter(u => u.toLowerCase().includes('.pdf'));
    console.log('PDF URLs:', pdfUrls.length > 0 ? pdfUrls.join(', ') : '(none found)');

    // Check if content has iframe or embed
    if (rawContent.includes('<iframe')) console.log('📌 HAS IFRAME');
    if (rawContent.includes('<embed')) console.log('📌 HAS EMBED');
    if (rawContent.includes('<object')) console.log('📌 HAS OBJECT');
    if (rawContent.includes('wp-content/uploads')) console.log('📌 HAS WP UPLOADS LINK');

    console.log('\n');
  }
}

main().catch(e => console.error('Error:', e.message));
