import { supabasePublic } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/entities
 * 
 * Fetch all entities (businesses) with optional filters.
 * ?search=query
 * ?status=Limpio | Bajo Observación | En Vigilancia | Sancionada
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const status = searchParams.get('status');

  let query = supabasePublic
    .from('businesses')
    .select('id, name, slug, status, summary:description_es, updated_at')
    .order('updated_at', { ascending: false });

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data: entities, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Format date to YYYY-MM-DD
  const formattedEntities = entities.map(entity => ({
    ...entity,
    date: entity.updated_at ? new Date(entity.updated_at).toISOString().split('T')[0] : null
  }));

  return NextResponse.json(formattedEntities);
}
