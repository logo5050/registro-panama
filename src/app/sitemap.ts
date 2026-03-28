import type { MetadataRoute } from 'next';
import { supabasePublic } from '@/lib/supabase';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://registro-panama.vercel.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fetch all business slugs for dynamic pages
  const { data: businesses } = await supabasePublic
    .from('businesses')
    .select('slug, updated_at')
    .order('updated_at', { ascending: false });

  const businessPages: MetadataRoute.Sitemap = (businesses || []).map((biz) => ({
    url: `${BASE_URL}/registro/${biz.slug}`,
    lastModified: new Date(biz.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...businessPages,
  ];
}
