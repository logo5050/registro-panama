/**
 * extract-entity.mjs — AI-powered business name extractor
 *
 * Uses Claude Haiku to extract real company names from article titles
 * and ACODECO edicto content. Replaces fragile regex patterns.
 *
 * Cost: ~$0.001 per 100 articles (Haiku is extremely cheap)
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory cache to avoid duplicate API calls within the same run
const cache = new Map();

// Rate limiting: stay under 50 req/min (free tier limit)
const RATE_LIMIT_MS = 2000; // ~46 req/min — safely under 50/min limit
let lastCallTime = 0;

async function callClaude(systemPrompt, userMessage, cacheKey) {
  // Return cached result if available
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastCallTime = Date.now();

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const result = msg.content[0]?.text?.trim() || 'NONE';

      // Reject generic or obviously bad responses
      // Use startsWith('NONE') to catch "NONE The document..." style responses
      const GENERIC = ['N/A', 'Panama', 'Panamá', 'La empresa', 'El banco', 'Las empresas', 'Los empresarios'];
      const entity = (
        result.startsWith('NONE') ||
        result.length < 2 ||
        GENERIC.includes(result) ||
        result.length > 120  // Reject anything that's clearly a sentence, not a name
      ) ? null : result;

      cache.set(cacheKey, entity);
      return entity;
    } catch (err) {
      // Retry on rate limit (429) with exponential backoff
      if (err.status === 429 && attempt < MAX_RETRIES) {
        const wait = attempt * 30_000; // 30s, 60s
        console.warn(`  ⏳ Rate limited — waiting ${wait / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.warn(`  ⚠️  Claude extraction failed (${err.message}) — skipping article`);
      cache.set(cacheKey, null);
      return null;
    }
  }
}

/**
 * Extract the primary business entity from a news article.
 *
 * @param {string} title  - Article title
 * @param {string} excerpt - First ~200 chars of article body
 * @returns {Promise<string|null>} Company name or null
 */
export async function extractBusinessFromNews(title, excerpt = '') {
  const systemPrompt = `You extract the primary Panamanian business or company name from Spanish-language news articles.

Rules:
- Return ONLY the company/organization name. Examples: "Banesco Panamá", "Copa Airlines", "Cemento Bayano", "Grupo Melo"
- If the article mentions multiple companies, return the most prominent one (usually the subject)
- Do NOT include verbs, actions, or context — just the name
- Return "NONE" if: the article is about macroeconomics, politics, government policy, a country, a politician, or no specific company is the subject
- Return "NONE" for: country names, personal names (without company), generic terms like "las empresas"`;

  const userMessage = `Title: "${title}"
Excerpt: "${excerpt.substring(0, 250)}"`;

  return callClaude(systemPrompt, userMessage, `news:${title}`);
}

/**
 * Extract the sanctioned business name from an ACODECO edicto or infraction post.
 *
 * @param {string} title   - Post title (e.g. "Edicto No. SG-0004-2026 D")
 * @param {string} content - Full post body (legal text of the edicto)
 * @returns {Promise<string|null>} Business name or null
 */
export async function extractBusinessFromACODECO(title, content = '') {
  const systemPrompt = `You extract the name of the business or company being investigated or sanctioned in ACODECO (Panama consumer protection agency) legal documents.

Rules:
- Return ONLY the business name. Examples: "Farmacia El Sol", "Supermercado Rey S.A.", "Bar y Discoteca La Esquina", "Honor", "Samsung Electronics"
- Look for: "agente económico", "la empresa", "la sociedad", "el establecimiento", "el denunciado", "contra:" — these phrases usually precede the business name
- Also look for: company websites (e.g. www.honor.com → "Honor"), brand names in product references, store/restaurant names
- Do NOT return "ACODECO", government agencies, case/expediente numbers, or article titles
- Do NOT return individual person names unless they clearly operate as a business (e.g. "José Pérez" alone = NONE, "Minisuper José Pérez" = valid)
- Return "NONE" if no specific business name can be found`;

  const userMessage = `Title: "${title}"
Content: "${content.substring(0, 3000)}"`;

  return callClaude(systemPrompt, userMessage, `acodeco:${title}`);
}

/**
 * Extract business name from a PDF document using Claude's native PDF vision.
 * Sends the raw PDF bytes — works on scanned/image PDFs that pdf-parse can't handle.
 *
 * @param {string} title - Post title (for cache key + context)
 * @param {Buffer} pdfBuffer - Raw PDF file bytes
 * @returns {Promise<string|null>} Business name or null
 */
export async function extractBusinessFromPDF(title, pdfBuffer) {
  const cacheKey = `pdf:${title}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastCallTime = Date.now();

  const systemPrompt = `You extract the name of the business or company being investigated or sanctioned in ACODECO (Panama consumer protection agency) legal documents.

Rules:
- Return ONLY the business name. Examples: "Farmacia El Sol", "Supermercado Rey S.A.", "Bar y Discoteca La Esquina", "Honor", "Samsung Electronics"
- Look for: "agente económico", "la empresa", "la sociedad", "el establecimiento", "el denunciado", "contra:" — these phrases usually precede the business name
- Also look for: company websites (e.g. www.honor.com → "Honor"), brand names in product references, store/restaurant names
- Do NOT return "ACODECO", government agencies, case/expediente numbers, or article titles
- Do NOT return individual person names unless they clearly operate as a business (e.g. "José Pérez" alone = NONE, "Minisuper José Pérez" = valid)
- Return "NONE" if no specific business name can be found`;

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBuffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: `This is an ACODECO legal document titled "${title}". What is the name of the business being investigated or sanctioned? Return ONLY the business name or "NONE".`,
            },
          ],
        }],
      });

      const result = msg.content[0]?.text?.trim() || 'NONE';
      const GENERIC = ['N/A', 'Panama', 'Panamá', 'La empresa', 'El banco', 'Las empresas', 'Los empresarios'];
      const entity = (
        result.startsWith('NONE') ||
        result.length < 2 ||
        GENERIC.includes(result) ||
        result.length > 120
      ) ? null : result;

      cache.set(cacheKey, entity);
      return entity;
    } catch (err) {
      if (err.status === 429 && attempt < MAX_RETRIES) {
        const wait = attempt * 30_000;
        console.warn(`  ⏳ Rate limited — waiting ${wait / 1000}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      console.warn(`  ⚠️  PDF vision extraction failed (${err.message}) — skipping`);
      cache.set(cacheKey, null);
      return null;
    }
  }
}

/**
 * Check if ANTHROPIC_API_KEY is available.
 * Call this at the start of each scraper to fail fast.
 */
export function requireAnthropicKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY is not set.');
    console.error('   Set it in your environment:');
    console.error('   export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }
  console.log('✅ ANTHROPIC_API_KEY found — AI extraction enabled');
}

/**
 * Log cache stats at end of run (useful for debugging/cost estimation).
 */
export function logExtractionStats() {
  console.log(`\n🤖 Claude extraction: ${cache.size} unique articles processed`);
  const hits = [...cache.values()].filter(Boolean).length;
  const misses = cache.size - hits;
  console.log(`   ✅ Extracted: ${hits} | ❌ NONE: ${misses}`);
}
