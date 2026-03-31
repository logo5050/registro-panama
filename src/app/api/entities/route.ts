import { supabasePublic } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/entities
 * 
 * Fetch all entities (businesses) with optional content-based filters and pagination.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');
  const statusFilter = searchParams.get('status');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '9');
  
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const baseFields = 'id, name, slug, status, description_es, updated_at';
  
  try {
    let entities: any[] = [];
    let totalCount = 0;

    if (statusFilter === 'Noticias') {
      const { data, count, error } = await supabasePublic
        .from('businesses')
        .select(`${baseFields}, events!inner(event_type)`, { count: 'exact' })
        .eq('events.event_type', 'news_mention')
        .order('updated_at', { ascending: false })
        .range(from, to);
      
      if (error) throw error;
      entities = data || [];
      totalCount = count || 0;

    } else if (statusFilter === 'Acodeco') {
      // Broaden ACODECO filter to check types, summary and source URL
      // We'll query businesses that have ANY event, then filter in JS if needed,
      // but let's try a better Supabase query first.
      const { data, count, error } = await supabasePublic
        .from('businesses')
        .select(`${baseFields}, events!inner(event_type, summary_es, source_url)`, { count: 'exact' })
        .or('event_type.ilike.%acodeco%,summary_es.ilike.%acodeco%,source_url.ilike.%acodeco.gob.pa%', { foreignTable: 'events' })
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      entities = data || [];
      totalCount = count || 0;

    } else if (statusFilter === 'Comunidad') {
      const { data, count, error } = await supabasePublic
        .from('businesses')
        .select(`${baseFields}, multimedia_reports!inner(id)`, { count: 'exact' })
        .in('multimedia_reports.source', ['WhatsApp', 'Instagram'])
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      entities = data || [];
      totalCount = count || 0;

    } else {
      // Default / "Todas"
      let queryBuilder = supabasePublic
        .from('businesses')
        .select(baseFields, { count: 'exact' });

      if (search) {
        queryBuilder = queryBuilder.ilike('name', `%${search}%`);
      }

      const { data, count, error } = await queryBuilder
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      entities = data || [];
      totalCount = count || 0;
    }

    // Format results
    const formattedEntities = entities.map((entity: any) => ({
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      status: entity.status,
      summary: entity.description_es || '',
      date: entity.updated_at ? new Date(entity.updated_at).toISOString().split('T')[0] : null
    }));

    // Final deduplication (unlikely with inner joins but good for safety)
    const uniqueEntities = Array.from(new Map(formattedEntities.map(item => [item.id, item])).values());

    return NextResponse.json({
      data: uniqueEntities,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit)
    });

  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
