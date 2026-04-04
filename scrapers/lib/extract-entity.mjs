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
 * Generic entity extraction — for ASEP, judiciary, and other sources.
 * Flexible prompt that handles any Panamanian government document.
 *
 * @param {string} text - Any text (title + excerpt, resolution text, etc.)
 * @param {string} source - Source hint ('asep', 'judiciary', 'sbp', etc.)
 * @returns {Promise<string|null>} Business name or null
 */
export async function extractBusinessName(text, source = 'generic') {
  const sourceHints = {
    asep: 'ASEP (Autoridad Nacional de los Servicios Públicos) utility resolution. Look for telecom, electricity, or water companies.',
    judiciary: 'Panamanian court ruling. Look for the defendant company (demandado) or primary business entity.',
    sbp: 'Superintendencia de Bancos banking sanction. Look for the sanctioned bank or financial institution.',
    generic: 'Panamanian government document about a business.',
  };

  const systemPrompt = `You extract the primary business or company name from Panamanian government documents.
Context: ${sourceHints[source] || sourceHints.generic}

Rules:
- Return ONLY the company/organization name. Examples: "Cable & Wireless", "ENSA", "Banco General", "Copa Airlines", "Supermercado Rey S.A."
- If multiple companies are mentioned, return the one being sanctioned, investigated, or primarily referenced
- Do NOT include legal references, resolution numbers, dates, or context — just the name
- Return "NONE" if no specific business entity can be identified
- Return "NONE" for government agencies, country names, or generic terms`;

  const userMessage = text.substring(0, 2000);
  return callClaude(systemPrompt, userMessage, `${source}:${text.substring(0, 100)}`);
}

/**
 * Extract multiple business entities from a longer document.
 * Returns an array of names. Used for backfill where one page may contain many entities.
 *
 * @param {string} text - Document text
 * @param {string} source - Source hint
 * @returns {Promise<string[]>} Array of business names
 */
export async function extractMultipleBusinesses(text, source = 'generic') {
  const sourceHints = {
    asep: 'ASEP utility resolutions',
    judiciary: 'Panamanian court rulings',
    sbp: 'Banking sanctions',
    generic: 'Panamanian government documents',
  };

  const cacheKey = `multi:${source}:${text.substring(0, 100)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  // Rate limiting
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastCallTime = Date.now();

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You extract ALL business/company names from ${sourceHints[source] || 'Panamanian government documents'}.

Rules:
- Return one company name per line, nothing else
- Examples: "Cable & Wireless", "ENSA", "Banco General"
- Only include actual business entities, not government agencies
- Return "NONE" if no businesses are found`,
      messages: [{ role: 'user', content: text.substring(0, 4000) }],
    });

    const result = msg.content[0]?.text?.trim() || 'NONE';
    if (result.startsWith('NONE')) {
      cache.set(cacheKey, []);
      return [];
    }

    const names = result
      .split('\n')
      .map(l => l.replace(/^[-•*\d.)\s]+/, '').trim())
      .filter(l => l.length >= 2 && l.length <= 120 && !l.startsWith('NONE'));

    cache.set(cacheKey, names);
    return names;
  } catch (err) {
    console.warn(`  ⚠️  Multi-extraction failed (${err.message})`);
    cache.set(cacheKey, []);
    return [];
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
