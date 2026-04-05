import { supabasePublic } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/entities/:id
 * 
 * Fetch a single entity and its associated TimelineEvents.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Check if id is UUID or slug
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

  let query = supabasePublic
    .from('businesses')
    .select('*, events(*)')
    .order('event_date', { foreignTable: 'events', ascending: false });

  if (isUuid) {
    query = query.eq('id', id);
  } else {
    query = query.eq('slug', id);
  }

  const { data: entity, error } = await query.single();

  if (error || !entity) {
    return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
  }

  // Format the response to match the requested TimelineEvent structure
  const formattedEvents = (entity.events || []).map((event: any) => ({
    id: event.id,
    type: event.event_type,
    date: event.event_date,
    title: event.summary_es,
    source: event.source_url, // Or just the hostname
    description: event.summary_es, // Using summary as description
    link: event.source_url,
    verified: true // Injected data is considered verified
  }));

  return NextResponse.json({
    ...entity,
    timeline: formattedEvents
  });
}
