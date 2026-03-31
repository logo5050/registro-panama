import { supabasePublic } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/entities
 * 
 * Fetch all entities (businesses) with optional content-based filters.
 * ?search=query
 * ?status=Resoluciones | Infracciones | Reportes Ciudadanos | TODAS
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const statusFilter = searchParams.get('status');

  // Base fields to select
  // We'll use * to be safe, then format it.
  const baseFields = 'id, name, slug, status, description_es, updated_at';
  
  try {
    let queryBuilder;

    if (statusFilter === 'Resoluciones') {
      // Filter by judicial rulings
      queryBuilder = supabasePublic
        .from('businesses')
        .select(`${baseFields}, events!inner(event_type)`)
        .in('events.event_type', ['court_ruling', 'RESOLUCIÓN JUDICIAL']);
    } else if (statusFilter === 'Infracciones') {
      // Filter by ACODECO infractions
      queryBuilder = supabasePublic
        .from('businesses')
        .select(`${baseFields}, events!inner(event_type)`)
        .in('events.event_type', ['acodeco_infraction', 'INFRACCIÓN ACODECO']);
    } else if (statusFilter === 'Reportes Ciudadanos') {
      // Filter by existence in multimedia_reports
      queryBuilder = supabasePublic
        .from('businesses')
        .select(`${baseFields}, multimedia_reports!inner(id)`);
    } else {
      // Basic query for "Todas" or other status labels
      queryBuilder = supabasePublic
        .from('businesses')
        .select(baseFields);
        
      if (statusFilter && statusFilter !== 'TODAS') {
        // Fallback: try filtering by the status column directly if not a special category
        queryBuilder = queryBuilder.eq('status', statusFilter);
      }
    }

    // Apply search
    if (search) {
      queryBuilder = queryBuilder.ilike('name', `%${search}%`);
    }

    // Apply order
    queryBuilder = queryBuilder.order('updated_at', { ascending: false });

    const { data: entities, error } = await queryBuilder;

    if (error) {
      console.error('Database query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format results to a clean array
    const formattedEntities = (entities || []).map((entity: any) => ({
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      status: entity.status,
      summary: entity.description_es || '',
      date: entity.updated_at ? new Date(entity.updated_at).toISOString().split('T')[0] : null
    }));

    // Post-process to ensure uniqueness by ID
    const uniqueMap = new Map();
    formattedEntities.forEach(e => {
      if (!uniqueMap.has(e.id)) {
        uniqueMap.set(e.id, e);
      }
    });

    return NextResponse.json(Array.from(uniqueMap.values()));
  } catch (err: any) {
    console.error('Runtime error in /api/entities:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
