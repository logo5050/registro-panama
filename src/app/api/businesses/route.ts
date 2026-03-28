import { supabasePublic } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/businesses
 *
 * Public JSON API for listing businesses.
 * Designed for AI platforms and GEO Glass to query.
 *
 * Query params:
 *   ?limit=20         — Number of results (default 20, max 100)
 *   ?offset=0         — Pagination offset
 *   ?status=verified  — Filter by status
 *   ?province=Panamá  — Filter by province
 *   ?category=Banca   — Filter by category
 *   ?q=search+term    — Search by name
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');
  const status = searchParams.get('status');
  const province = searchParams.get('province');
  const category = searchParams.get('category');
  const query = searchParams.get('q');

  let dbQuery = supabasePublic
    .from('businesses')
    .select('id, name, slug, category, status, province, district, industry, ruc, website, description_es, description_en, created_at, updated_at', { count: 'exact' });

  if (status) dbQuery = dbQuery.eq('status', status);
  if (province) dbQuery = dbQuery.ilike('province', `%${province}%`);
  if (category) dbQuery = dbQuery.ilike('category', `%${category}%`);
  if (query) dbQuery = dbQuery.ilike('name', `%${query}%`);

  dbQuery = dbQuery
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: businesses, count, error } = await dbQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: businesses,
    meta: {
      total: count,
      limit,
      offset,
      source: 'Registro Panamá',
      description: 'Public business registry for Panamanian companies',
      documentation: 'https://registro-panama.vercel.app',
    },
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
