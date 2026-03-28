import { supabasePublic } from '@/lib/supabase';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const PER_PAGE = 25;

type EventTypeFilter = 'news_mention' | 'acodeco_infraction' | 'court_ruling' | 'sanction' | '';

type SearchParams = Promise<{
  page?: string;
  q?: string;
  status?: string;
  eventType?: string;
}>;

const CATEGORIES: { value: EventTypeFilter; labelEs: string; labelEn: string; emoji: string }[] = [
  { value: '',                  labelEs: 'Todas',                labelEn: 'All',               emoji: '🏢' },
  { value: 'news_mention',      labelEs: 'En Noticias',          labelEn: 'In the News',       emoji: '📰' },
  { value: 'acodeco_infraction',labelEs: 'Infracciones ACODECO', labelEn: 'ACODECO Infractions',emoji: '⚠️' },
  { value: 'court_ruling',      labelEs: 'Fallos Judiciales',    labelEn: 'Court Rulings',     emoji: '⚖️' },
  { value: 'sanction',          labelEs: 'Sanciones',            labelEn: 'Sanctions',         emoji: '🚫' },
];

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const currentPage  = Math.max(1, parseInt(params.page || '1'));
  const searchQuery  = params.q || '';
  const statusFilter = params.status || '';
  const eventTypeFilter = (params.eventType || '') as EventTypeFilter;
  const offset = (currentPage - 1) * PER_PAGE;

  // Build select: use PostgREST inner join when filtering by event type
  // This avoids passing 700+ UUIDs in a URL query param
  type BusinessRow = {
    name: string;
    slug: string;
    category: string | null;
    status: string | null;
    province: string | null;
    industry: string | null;
    updated_at: string | null;
  };

  const baseFields = 'name, slug, category, status, province, industry, updated_at';
  const selectFields = eventTypeFilter
    ? `${baseFields}, events!inner(event_type)`
    : baseFields;

  let baseQuery = supabasePublic
    .from('businesses')
    .select(selectFields, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + PER_PAGE - 1);

  if (searchQuery)     baseQuery = baseQuery.ilike('name', `%${searchQuery}%`);
  if (statusFilter)    baseQuery = baseQuery.eq('status', statusFilter);
  if (eventTypeFilter) baseQuery = baseQuery.eq('events.event_type', eventTypeFilter);

  const { data: businesses, count } = await baseQuery.returns<BusinessRow[]>();

  const total      = count || 0;
  const totalPages = Math.ceil(total / PER_PAGE);

  const activeCategory = CATEGORIES.find(c => c.value === eventTypeFilter) || CATEGORIES[0];

  function buildUrl(page: number, q?: string, status?: string, eventType?: string) {
    const p = new URLSearchParams();
    if (page > 1)    p.set('page', String(page));
    if (q)           p.set('q', q);
    if (status)      p.set('status', status);
    if (eventType)   p.set('eventType', eventType);
    return p.toString() ? `/?${p.toString()}` : '/';
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black font-sans transition-colors duration-300">
      <main className="max-w-4xl mx-auto px-6 py-20">

        {/* Header */}
        <div className="mb-10 text-center sm:text-left">
          <h1 className="text-6xl font-black text-slate-900 dark:text-white tracking-tighter mb-4">
            Registro Panamá
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
            Directorio de transparencia y credibilidad empresarial.
            Verifica el historial y estado de empresas en Panamá.
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-3">
            {total.toLocaleString()} empresas registradas · Actualizado por agentes de IA
          </p>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {CATEGORIES.map((cat) => {
            const isActive = cat.value === eventTypeFilter;
            return (
              <Link
                key={cat.value}
                href={buildUrl(1, searchQuery, statusFilter, cat.value || undefined)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                  isActive
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400'
                }`}
              >
                <span>{cat.emoji}</span>
                <span>{cat.labelEs}</span>
                <span className="hidden sm:inline text-[10px] opacity-60">/ {cat.labelEn}</span>
              </Link>
            );
          })}
        </div>

        {/* Search + Status Filter */}
        <form method="GET" action="/" className="flex flex-col sm:flex-row gap-3 mb-8">
          {/* Preserve active category tab across searches */}
          {eventTypeFilter && (
            <input type="hidden" name="eventType" value={eventTypeFilter} />
          )}
          <input
            type="text"
            name="q"
            defaultValue={searchQuery}
            placeholder="Buscar empresa... / Search business..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los estados</option>
            <option value="verified">Verificado</option>
            <option value="watchlist">En Vigilancia</option>
            <option value="geo_glass_client">GEO Glass Client</option>
          </select>
          <button
            type="submit"
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors"
          >
            Buscar
          </button>
          {(searchQuery || statusFilter || eventTypeFilter) && (
            <Link
              href="/"
              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors text-center"
            >
              Limpiar
            </Link>
          )}
        </form>

        {/* Results header */}
        <section className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
              {eventTypeFilter
                ? `${activeCategory.emoji} ${activeCategory.labelEs} — ${total.toLocaleString()} empresas`
                : searchQuery || statusFilter
                ? `${total.toLocaleString()} resultados`
                : 'Empresas Recientes / Recent Businesses'}
            </h2>
            {totalPages > 1 && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Página {currentPage} de {totalPages}
              </span>
            )}
          </div>

          {/* Business list */}
          <div className="grid gap-4">
            {businesses && businesses.length > 0 ? (
              businesses.map((biz) => (
                <Link
                  key={biz.slug}
                  href={`/registro/${biz.slug}`}
                  className="group block p-6 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl hover:border-blue-500 dark:hover:border-blue-500 transition-all shadow-sm hover:shadow-md"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors truncate">
                        {biz.name}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {biz.category && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            {biz.category}
                          </span>
                        )}
                        {biz.province && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            📍 {biz.province}
                          </span>
                        )}
                        {biz.industry && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            {biz.industry}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-tighter border shrink-0 ml-4 ${
                      biz.status === 'watchlist'
                        ? 'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900'
                        : biz.status === 'geo_glass_client'
                        ? 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900'
                        : 'bg-green-50 text-green-600 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900'
                    }`}>
                      {biz.status?.replace(/_/g, ' ') || 'watchlist'}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                <p className="text-slate-400 italic mb-2">No se encontraron resultados.</p>
                <Link href="/" className="text-sm text-blue-500 hover:underline">Ver todas las empresas</Link>
              </div>
            )}
          </div>
        </section>

        {/* Pagination */}
        {totalPages > 1 && (
          <nav className="flex items-center justify-between mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
            <Link
              href={currentPage > 1 ? buildUrl(currentPage - 1, searchQuery, statusFilter, eventTypeFilter || undefined) : '#'}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                currentPage > 1
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  : 'opacity-30 pointer-events-none bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}
            >
              ← Anterior
            </Link>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let page: number;
                if (totalPages <= 7) {
                  page = i + 1;
                } else if (currentPage <= 4) {
                  page = i + 1;
                } else if (currentPage >= totalPages - 3) {
                  page = totalPages - 6 + i;
                } else {
                  page = currentPage - 3 + i;
                }
                return (
                  <Link
                    key={page}
                    href={buildUrl(page, searchQuery, statusFilter, eventTypeFilter || undefined)}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                      page === currentPage
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {page}
                  </Link>
                );
              })}
            </div>

            <Link
              href={currentPage < totalPages ? buildUrl(currentPage + 1, searchQuery, statusFilter, eventTypeFilter || undefined) : '#'}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                currentPage < totalPages
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  : 'opacity-30 pointer-events-none bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}
            >
              Siguiente →
            </Link>
          </nav>
        )}

        {/* How it works */}
        <section className="mt-16 p-8 bg-slate-900 dark:bg-blue-950/20 rounded-3xl text-white">
          <h3 className="text-2xl font-bold mb-4">¿Cómo funciona? / How it works</h3>
          <div className="grid md:grid-cols-3 gap-8 text-slate-300 text-sm leading-relaxed">
            <div>
              <p className="font-bold text-white mb-2">1. Monitoreo Automático</p>
              <p>Agentes de IA monitorean fuentes oficiales (ACODECO, Órgano Judicial, noticias) e ingieren eventos automáticamente.</p>
            </div>
            <div>
              <p className="font-bold text-white mb-2">2. Registro Público</p>
              <p>Cada empresa tiene un perfil único con su historial de eventos, accesible para consumidores y plataformas de IA.</p>
            </div>
            <div>
              <p className="font-bold text-white mb-2">3. Integración GEO Glass</p>
              <p>Los datos alimentan auditorías de visibilidad en IA, ayudando a empresas a mejorar su presencia digital.</p>
            </div>
          </div>
        </section>

        {/* API section */}
        <section className="mt-8 p-6 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">API Pública</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Accede a los datos del registro vía nuestra API JSON gratuita.
          </p>
          <div className="space-y-2 font-mono text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl">
            <p><span className="text-green-600">GET</span> /api/businesses</p>
            <p><span className="text-green-600">GET</span> /api/businesses/[slug]</p>
            <p><span className="text-green-600">GET</span> /api/businesses?province=Panamá&status=verified</p>
          </div>
        </section>

      </main>
    </div>
  );
}
