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

// Polite rate limiting: max ~10 req/sec for Haiku
const RATE_LIMIT_MS = 120;
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

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const result = msg.content[0]?.text?.trim() || 'NONE';

    // Reject generic or obviously bad responses
    const GENERIC = ['NONE', 'N/A', 'Panama', 'Panamá', 'La empresa', 'El banco', 'Las empresas', 'Los empresarios'];
    const entity = (result === 'NONE' || result.length < 2 || GENERIC.includes(result)) ? null : result;

    cache.set(cacheKey, entity);
    return entity;
  } catch (err) {
    console.warn(`  ⚠️  Claude extraction failed (${err.message}) — skipping article`);
    cache.set(cacheKey, null);
    return null;
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
  const systemPrompt = `You extract the name of the business or company being investigated or sanctioned in ACODECO (Panama consumer protection agency) records.

Rules:
- Return ONLY the business name. Examples: "Farmacia El Sol", "Supermercado Rey S.A.", "Bar y Discoteca La Esquina"
- Look for the "agente económico" (economic agent / business) in the legal text
- Do NOT return "ACODECO", case/expediente numbers, or article titles
- Do NOT return the names of individuals (people, not businesses) unless they operate as a business
- Return "NONE" if no specific business name can be found`;

  const userMessage = `Title: "${title}"
Content: "${content.substring(0, 800)}"`;

  return callClaude(systemPrompt, userMessage, `acodeco:${title}`);
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
