import { supabasePublic } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/entities
 * 
 * Fetch all entities (businesses) with optional content-based filters and pagination.
 * ?search=query
 * ?status=Noticias | Acodeco | Comunidad | TODAS
 * ?page=1
 * ?limit=9
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const statusFilter = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '9');
  
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Base fields to select
  const baseFields = 'id, name, slug, status, description_es, updated_at';
  
  try {
    let queryBuilder;

    if (statusFilter === 'Noticias') {
      // Filter by news mentions
      queryBuilder = supabasePublic
        .from('businesses')
        .select(`${baseFields}, events!inner(event_type)`, { count: 'exact' })
        .eq('events.event_type', 'news_mention');
    } else if (statusFilter === 'Acodeco') {
      // Filter by ACODECO infractions, sanctions, or court rulings
      // Using a simpler .in() which is more reliable across joins in PostgREST
      queryBuilder = supabasePublic
        .from('businesses')
        .select(`${baseFields}, events!inner(event_type)`, { count: 'exact' })
        .in('events.event_type', ['acodeco_infraction', 'sanction', 'RESOLUCIÓN JUDICIAL', 'INFRACCIÓN ACODECO', 'court_ruling']);
    } else if (statusFilter === 'Comunidad') {
      // Filter by community reports from WhatsApp/Instagram
      queryBuilder = supabasePublic
        .from('businesses')
        .select(`${baseFields}, multimedia_reports!inner(id)`, { count: 'exact' })
        .in('multimedia_reports.source', ['WhatsApp', 'Instagram']);
    } else {
      // Basic query for "Todas"
      queryBuilder = supabasePublic
        .from('businesses')
        .select(baseFields, { count: 'exact' });
        
      if (statusFilter && statusFilter !== 'TODAS') {
        queryBuilder = queryBuilder.eq('status', statusFilter);
      }
    }

    if (search) {
      queryBuilder = queryBuilder.ilike('name', `%${search}%`);
    }

    queryBuilder = queryBuilder
      .order('updated_at', { ascending: false })
      .range(from, to);

    const { data: entities, count, error } = await queryBuilder;

    if (error) {
      console.error('Database query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // FALLBACK for ACODECO if no results found with specific types
    // Sometimes scrapers might have tagged them as news_mention but with ACODECO in summary
    let finalData = entities || [];
    let finalCount = count || 0;

    if (statusFilter === 'Acodeco' && (!entities || entities.length === 0)) {
      const fallbackQuery = supabasePublic
        .from('businesses')
        .select(`${baseFields}, events!inner(summary_es)`, { count: 'exact' })
        .ilike('events.summary_es', '%acodeco%')
        .range(from, to);
      
      if (search) fallbackQuery.ilike('name', `%${search}%`);
      
      const { data: fbData, count: fbCount } = await fallbackQuery;
      if (fbData) {
        finalData = fbData;
        finalCount = fbCount || 0;
      }
    }

    const formattedEntities = (finalData || []).map((entity: any) => ({
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      status: entity.status,
      summary: entity.description_es || '',
      date: entity.updated_at ? new Date(entity.updated_at).toISOString().split('T')[0] : null
    }));

    // Post-process to ensure uniqueness
    const uniqueEntities = Array.from(new Map(formattedEntities.map(item => [item.id, item])).values());

    return NextResponse.json({
      data: uniqueEntities,
      total: finalCount,
      page,
      limit,
      totalPages: Math.ceil(finalCount / limit)
    });
  } catch (err: any) {
    console.error('Runtime error in /api/entities:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
