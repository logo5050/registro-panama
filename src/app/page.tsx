import { supabasePublic } from '@/lib/supabase';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { data: businesses, count } = await supabasePublic
    .from('businesses')
    .select('name, slug, category, status, province, industry, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .limit(25);

  const total = count || 0;

  return (
    <div className="min-h-screen bg-white dark:bg-black font-sans transition-colors duration-300">
      <main className="max-w-4xl mx-auto px-6 py-20">
        <div className="mb-16 text-center sm:text-left">
          <h1 className="text-6xl font-black text-slate-900 dark:text-white tracking-tighter mb-4">
            Registro Panamá
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
            Directorio de transparencia y credibilidad empresarial.
            Verifica el historial y estado de empresas en Panamá.
          </p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-3">
            {total} empresas registradas · Actualizado por agentes de IA
          </p>
        </div>

        <section className="mb-12">
          <h2 className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-6">
            Empresas Recientes / Recent Businesses
          </h2>

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
                            {biz.province}
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
                      {biz.status?.replace(/_/g, ' ') || 'unknown'}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                <p className="text-slate-400 italic">No hay empresas registradas aún.</p>
                <p className="text-sm text-slate-500 mt-2">Los agentes de IA comenzarán a ingerir datos automáticamente.</p>
              </div>
            )}
          </div>
        </section>

        <section className="mt-16 p-8 bg-slate-900 dark:bg-blue-950/20 rounded-3xl text-white">
          <h3 className="text-2xl font-bold mb-4">¿Cómo funciona?</h3>
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
