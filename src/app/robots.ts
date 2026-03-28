import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://registro-panama.vercel.app';

/**
 * robots.txt — Optimized for AI platform crawlers.
 *
 * We WANT AI bots (ChatGPT, Gemini, Perplexity, Claude) to index
 * this registry. That's the whole point of the project.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/ingest-event'],
      },
      // Explicitly welcome AI crawlers
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'Google-Extended', 'PerplexityBot', 'ClaudeBot', 'Applebot'],
        allow: '/',
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
