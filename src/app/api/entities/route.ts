import { supabasePublic } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/entities
 * 
 * Fetch all entities (businesses) with optional filters.
 * ?search=query
 * ?status=Resoluciones | Infracciones | Reportes Ciudadanos
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const status = searchParams.get('status');

  // Base fields to select
  const baseFields = 'id, name, slug, status, description_es, updated_at';
  
  // Build query
  let queryBuilder;

  if (status === 'Resoluciones') {
    // Filter by judicial rulings (court_ruling or RESOLUCIÓN JUDICIAL)
    queryBuilder = supabasePublic
      .from('businesses')
      .select(`${baseFields}, events!inner(event_type)`)
      .in('events.event_type', ['court_ruling', 'RESOLUCIÓN JUDICIAL']);
  } else if (status === 'Infracciones') {
    // Filter by ACODECO infractions (acodeco_infraction or INFRACCIÓN ACODECO)
    queryBuilder = supabasePublic
      .from('businesses')
      .select(`${baseFields}, events!inner(event_type)`)
      .in('events.event_type', ['acodeco_infraction', 'INFRACCIÓN ACODECO']);
  } else if (status === 'Reportes Ciudadanos') {
    // Filter by existence in multimedia_reports
    queryBuilder = supabasePublic
      .from('businesses')
      .select(`${baseFields}, multimedia_reports!inner(id)`);
  } else {
    // Basic query for "Todas" or other status labels ('Limpio', 'Sancionada', etc.)
    queryBuilder = supabasePublic
      .from('businesses')
      .select(baseFields);
      
    if (status && status !== 'TODAS') {
      queryBuilder = queryBuilder.eq('status', status);
    }
  }

  // Apply search
  if (search) {
    queryBuilder = queryBuilder.ilike('name', `%${search}%`);
  }

  // Apply order and execute
  queryBuilder = queryBuilder.order('updated_at', { ascending: false });

  const { data: entities, error } = await queryBuilder;

  if (error) {
    console.error('API Error in /api/entities:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Format date and clean up response
  const formattedEntities = (entities || []).map(entity => ({
    id: entity.id,
    name: entity.name,
    slug: entity.slug,
    status: entity.status,
    summary: entity.description_es,
    date: entity.updated_at ? new Date(entity.updated_at).toISOString().split('T')[0] : null
  }));

  // Unique by ID (in case of multiple matching events/reports)
  const uniqueEntities = Array.from(new Map(formattedEntities.map(e => [e.id, e])).values());

  return NextResponse.json(uniqueEntities);
}
