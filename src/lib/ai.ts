import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const CLAUDE_MODEL = 'claude-3-haiku-20240307';

/**
 * Extracts business name from unstructured text or evidence descriptions.
 */
export async function extractBusinessName(text: string): Promise<string | null> {
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 100,
      system: "You are an expert at identifying Panamanian business names from consumer complaints. Return ONLY the business name or 'NONE'.",
      messages: [{ role: 'user', content: `Extract the business name from this complaint: "${text}"` }],
    });

    const result = (response.content[0] as any).text.trim();
    return result === 'NONE' ? null : result;
  } catch (error) {
    console.error('AI Extraction Error:', error);
    return null;
  }
}

/**
 * Generates a neutral, public-safe summary of a complaint.
 */
export async function generatePublicSummary(text: string): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: "You are a neutral news editor. Summarize this consumer complaint in Spanish for a public registry. Keep it factual, remove personal names or insults, and focus on the core issue (e.g., service failure, overcharge). Max 200 characters.",
      messages: [{ role: 'user', content: text }],
    });

    return (response.content[0] as any).text.trim();
  } catch (error) {
    console.error('AI Summary Error:', error);
    return text.substring(0, 200) + '...';
  }
}

/**
 * Analyzes evidence (receipts, screenshots) using Claude Vision.
 * (Placeholder for actual vision implementation if URLs are accessible)
 */
export async function analyzeEvidenceVision(imageUrls: string[]): Promise<{ businessName: string | null, summary: string | null }> {
  // Vision requires fetching the image and sending base64 to Claude.
  // For now, we return null to allow the text-based logic to take precedence.
  return { businessName: null, summary: null };
}

/**
 * Generates JSON-LD for SEO discoverability.
 */
export function generateReviewJsonLd(businessName: string, summary: string, date: string) {
  return {
    "@context": "https://schema.org/",
    "@type": "Review",
    "itemReviewed": {
      "@type": "Organization",
      "name": businessName
    },
    "reviewRating": {
      "@type": "Rating",
      "ratingValue": "1",
      "bestRating": "5"
    },
    "author": {
      "@type": "Person",
      "name": "Consumidor Anónimo"
    },
    "reviewBody": summary,
    "datePublished": date
  };
}

/**
 * Identifies specific violations of Panamanian Law 45 based on a complaint.
 */
export async function identifyLaw45Violations(complaint: string): Promise<string[]> {
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      system: "You are a legal expert in Panamanian Consumer Protection Law (Ley 45 de 2007). Identify 2-3 specific articles violated in the following complaint. Return ONLY a JSON array of strings with Article Number and a brief Title.",
      messages: [{ role: 'user', content: complaint }],
    });

    const text = (response.content[0] as any).text.trim();
    return JSON.parse(text);
  } catch (error) {
    console.error('Law 45 Analysis Error:', error);
    return ["Artículo 35: Derecho a la Información", "Artículo 36: Protección contra Prácticas Abusivas"];
  }
}

/**
 * Drafts a formal Demand Letter (Carta de Reclamo) for the consumer.
 */
export async function draftDemandLetter(complaint: string, businessName: string, violations: string[]): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system: "You are a consumer rights attorney in Panama. Draft a formal, professional 'Carta de Reclamo' in Spanish based on the complaint. Include placeholders like [NOMBRE DEL CONSUMIDOR], [CÉDULA], and [FECHA]. Use formal legal tone, citing the provided violations of Ley 45.",
      messages: [{ role: 'user', content: `Business: ${businessName}\nViolations: ${violations.join(', ')}\nComplaint: ${complaint}` }],
    });

    return (response.content[0] as any).text.trim();
  } catch (error) {
    console.error('Demand Letter Draft Error:', error);
    return "Error al generar la carta. Por favor intente de nuevo.";
  }
}
