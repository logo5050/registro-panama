import { supabasePublic } from '@/lib/supabase';
import { NextResponse } from 'next/server';

type RouteParams = {
  params: Promise<{ slug: string }>;
};

/**
 * GET /api/businesses/[slug]
 *
 * Returns full business profile + events as JSON.
 * Designed for AI platforms and GEO Glass audit engine.
 *
 * Includes Schema.org-compatible structured data.
 */
export async function GET(_req: Request, { params }: RouteParams) {
  const { slug } = await params;

  const { data: business, error } = await supabasePublic
    .from('businesses')
    .select('*, events(*)')
    .eq('slug', slug)
    .single();

  if (error || !business) {
    return NextResponse.json(
      { error: 'Business not found', slug },
      { status: 404 }
    );
  }

  // Build Schema.org compatible response
  const response = {
    data: business,
    schema_org: {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: business.name,
      url: business.website || `https://registro-panama.vercel.app/registro/${business.slug}`,
      identifier: business.ruc || business.slug,
      description: business.description_en || business.description_es,
      address: business.province ? {
        '@type': 'PostalAddress',
        addressRegion: business.province,
        addressLocality: business.district,
        addressCountry: 'PA',
      } : undefined,
      knowsAbout: business.category,
      foundingDate: business.founded_year?.toString(),
    },
    meta: {
      source: 'Registro Panamá',
      last_updated: business.updated_at,
      events_count: business.events?.length || 0,
      registry_url: `https://registro-panama.vercel.app/registro/${business.slug}`,
    },
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
