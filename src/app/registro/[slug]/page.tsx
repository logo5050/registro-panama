import { supabasePublic } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import Link from 'next/link';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const { data: business } = await supabasePublic
    .from('businesses')
    .select('name, description_en, description_es, category, province')
    .eq('slug', slug)
    .single();

  if (!business) return { title: 'Empresa No Encontrada' };

  const description = business.description_en || business.description_es
    || `Business profile for ${business.name} in Panama.`;

  return {
    title: `${business.name} — Registro Empresarial`,
    description,
    openGraph: {
      title: `${business.name} | Registro Panamá`,
      description,
      type: 'profile',
    },
  };
}

export default async function BusinessPage({ params }: Props) {
  const { slug } = await params;

  const { data: business, error } = await supabasePublic
    .from('businesses')
    .select('*, events(*)')
    .eq('slug', slug)
    .single();

  if (error || !business) {
    notFound();
  }

  // Sort events by date descending
  const events = (business.events || []).sort(
    (a: { event_date: string }, b: { event_date: string }) =>
      new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
  );

  // Schema.org structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: business.name,
    url: business.website || `https://registro-panama.vercel.app/registro/${business.slug}`,
    description: business.description_en || business.description_es,
    identifier: business.ruc || business.slug,
    taxID: business.ruc || undefined,
    knowsAbout: business.category,
    foundingDate: business.founded_year?.toString(),
    inLanguage: ['es-PA', 'en-US'],
    address: business.province ? {
      '@type': 'PostalAddress',
      addressRegion: business.province,
      addressLocality: business.district,
      addressCountry: 'PA',
    } : undefined,
    review: events.map((e: Record<string, string>) => ({
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: business.status === 'watchlist' ? '1' : (business.status === 'geo_glass_client' ? '5' : '3'),
      },
      author: { '@type': 'Organization', name: 'Registro Panamá' },
      reviewBody: e.summary_en || e.summary_es,
      datePublished: e.event_date,
      publisher: { '@type': 'Organization', name: 'GEO Glass' },
    })),
  };

  const statusConfig: Record<string, { label: string; style: string }> = {
    watchlist: {
      label: 'En Vigilancia',
      style: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900',
    },
    geo_glass_client: {
      label: 'GEO Glass Client',
      style: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900',
    },
    verified: {
      label: 'Verificado',
      style: 'bg-green-50 text-green-600 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900',
    },
  };

  const eventTypeLabels: Record<string, { es: string; color: string }> = {
    acodeco_infraction: { es: 'Infracción ACODECO', color: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/30' },
    court_ruling: { es: 'Resolución Judicial', color: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/30' },
    geo_audit_passed: { es: 'Auditoría GEO Aprobada', color: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/30' },
    news_mention: { es: 'Mención en Noticias', color: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30' },
    license_granted: { es: 'Licencia Otorgada', color: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30' },
    license_revoked: { es: 'Licencia Revocada', color: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/30' },
    ownership_change: { es: 'Cambio de Propiedad', color: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/30' },
    sanction: { es: 'Sanción', color: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/30' },
  };

  const statusInfo = statusConfig[business.status] || statusConfig.verified;

  return (
    <main className="max-w-5xl mx-auto p-6 md:p-12 font-sans dark:bg-black min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="border-b border-slate-200 dark:border-slate-800 pb-8 mb-10">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <nav className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              <Link href="/" className="hover:underline">Inicio</Link> / <span className="text-slate-900 dark:text-slate-100">Registro</span>
            </nav>
            <h1 className="text-5xl font-black text-slate-900 dark:text-white tracking-tight">{business.name}</h1>
            <div className="flex flex-wrap gap-2 mt-3">
              {business.category && (
                <span className="text-sm text-slate-500 dark:text-slate-400">{business.category}</span>
              )}
              {business.province && (
                <span className="text-sm text-slate-400 dark:text-slate-500">· {business.province}{business.district ? `, ${business.district}` : ''}</span>
              )}
            </div>
          </div>

          <span className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border ${statusInfo.style}`}>
            {statusInfo.label}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-12">
          {/* Business Profile */}
          <section>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 border-l-4 border-blue-600 pl-4">
              Perfil / Profile
            </h2>
            <div className="space-y-6">
              {business.description_es && (
                <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800">
                  <p className="text-slate-800 dark:text-slate-200 leading-relaxed italic">&ldquo;{business.description_es}&rdquo;</p>
                </div>
              )}
              {business.description_en && (
                <div className="p-6">
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{business.description_en}</p>
                </div>
              )}
            </div>
          </section>

          {/* Event Timeline */}
          <section>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6 border-l-4 border-blue-600 pl-4">
              Historial / Timeline ({events.length})
            </h2>
            <div className="space-y-4">
              {events.length > 0 ? (
                events.map((event: Record<string, string>) => {
                  const typeInfo = eventTypeLabels[event.event_type] || {
                    es: event.event_type.replace(/_/g, ' '),
                    color: 'text-slate-600 bg-slate-50 dark:text-slate-400 dark:bg-slate-900',
                  };
                  return (
                    <div key={event.id} className="p-6 border border-slate-100 dark:border-slate-800 rounded-xl hover:shadow-sm transition-shadow">
                      <div className="flex justify-between items-start mb-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${typeInfo.color}`}>
                          {typeInfo.es}
                        </span>
                        <time className="text-xs text-slate-400 dark:text-slate-500 font-mono">{event.event_date}</time>
                      </div>
                      <p className="text-slate-900 dark:text-slate-100 font-medium mb-2">{event.summary_es}</p>
                      {event.summary_en && (
                        <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4">{event.summary_en}</p>
                      )}
                      <a
                        href={event.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        VERIFICAR FUENTE →
                      </a>
                    </div>
                  );
                })
              ) : (
                <p className="text-slate-400 italic p-6">No hay eventos registrados para esta empresa.</p>
              )}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Business Details Card */}
          {(business.ruc || business.province || business.website || business.phone) && (
            <div className="p-6 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl">
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-4">Detalles</h3>
              <dl className="space-y-3 text-sm">
                {business.ruc && (
                  <div>
                    <dt className="text-slate-400 dark:text-slate-500">RUC</dt>
                    <dd className="text-slate-900 dark:text-white font-mono">{business.ruc}{business.dv ? `-${business.dv}` : ''}</dd>
                  </div>
                )}
                {business.province && (
                  <div>
                    <dt className="text-slate-400 dark:text-slate-500">Ubicación</dt>
                    <dd className="text-slate-900 dark:text-white">{business.province}{business.district ? `, ${business.district}` : ''}</dd>
                  </div>
                )}
                {business.industry && (
                  <div>
                    <dt className="text-slate-400 dark:text-slate-500">Industria</dt>
                    <dd className="text-slate-900 dark:text-white">{business.industry}</dd>
                  </div>
                )}
                {business.founded_year && (
                  <div>
                    <dt className="text-slate-400 dark:text-slate-500">Fundada</dt>
                    <dd className="text-slate-900 dark:text-white">{business.founded_year}</dd>
                  </div>
                )}
                {business.website && (
                  <div>
                    <dt className="text-slate-400 dark:text-slate-500">Sitio Web</dt>
                    <dd><a href={business.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{business.website.replace(/^https?:\/\//, '')}</a></dd>
                  </div>
                )}
                {business.phone && (
                  <div>
                    <dt className="text-slate-400 dark:text-slate-500">Teléfono</dt>
                    <dd className="text-slate-900 dark:text-white">{business.phone}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* GEO Glass CTA */}
          <div className="bg-slate-900 dark:bg-slate-800 text-white p-8 rounded-2xl border border-slate-800">
            <h3 className="text-lg font-bold mb-4">GEO Glass</h3>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              Mejora la visibilidad de tu empresa en ChatGPT, Gemini, Perplexity y Claude con una auditoría completa de GEO Glass.
            </p>
            <a
              href="https://geoglass.app"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-bold transition-colors"
            >
              Solicitar Auditoría
            </a>
          </div>

          {/* API Access */}
          <div className="p-6 border border-slate-200 dark:border-slate-800 rounded-2xl">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3">API</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono break-all">
              GET /api/businesses/{business.slug}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
