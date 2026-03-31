-- Migration 002: Add search_businesses_v2 RPC for cross-table searching
-- This allows searching by business name OR event content (edictos, case numbers, etc.)
-- PostgREST cannot handle OR across tables, so we use a Postgres function.

CREATE OR REPLACE FUNCTION search_businesses_v2(
  p_search_query TEXT, 
  p_status_filter TEXT DEFAULT '', 
  p_event_type_filter TEXT DEFAULT '', 
  p_limit INT DEFAULT 25, 
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  category TEXT,
  status business_status,
  province TEXT,
  industry TEXT,
  updated_at TIMESTAMPTZ,
  total_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH matched_ids AS (
    SELECT b.id
    FROM businesses b
    LEFT JOIN events e ON b.id = e.business_id
    WHERE 
      (
        p_search_query = '' 
        OR b.name ILIKE '%' || p_search_query || '%'
        OR e.summary_es ILIKE '%' || p_search_query || '%'
        OR e.summary_en ILIKE '%' || p_search_query || '%'
      )
      AND (p_status_filter = '' OR b.status::text = p_status_filter)
      AND (p_event_type_filter = '' OR e.event_type::text = p_event_type_filter)
    GROUP BY b.id
  )
  SELECT 
    b.id, b.name, b.slug, b.category, b.status, b.province, b.industry, b.updated_at,
    COUNT(*) OVER() AS total_count
  FROM businesses b
  JOIN matched_ids m ON b.id = m.id
  ORDER BY b.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant public access to the RPC
GRANT EXECUTE ON FUNCTION search_businesses_v2 TO anon;
GRANT EXECUTE ON FUNCTION search_businesses_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION search_businesses_v2 TO service_role;
