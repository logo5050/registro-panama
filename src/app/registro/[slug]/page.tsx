import React from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  ArrowLeft,
  ExternalLink,
  Info
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabasePublic } from '@/lib/supabase';

type TimelineEvent = {
  id: string;
  type: string;
  date: string;
  title: string;
  source: string;
  description: string;
  link: string | null;
  verified: boolean;
};

type Entity = {
  id: string;
  name: string;
  slug: string;
  status: string;
  summary: string;
  description_es?: string;
  description_en?: string;
  updated_at: string;
  timeline: TimelineEvent[];
};

// Directly fetch data from Supabase in the Server Component
async function getEntity(slug: string): Promise<Entity | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slug);

  let query = supabasePublic
    .from('businesses')
    .select('*, events(*)')
    .order('event_date', { foreignTable: 'events', ascending: false });

  if (isUuid) {
    query = query.eq('id', slug);
  } else {
    query = query.eq('slug', slug);
  }

  const { data: entity, error } = await query.single();

  if (error || !entity) {
    console.error('Database fetch error or entity not found:', error);
    return null;
  }

  // Format the response to match the requested TimelineEvent structure
  const formattedEvents = (entity.events || []).map((event: any) => ({
    id: event.id,
    type: event.event_type.replace(/_/g, ' ').toUpperCase(),
    date: event.event_date,
    title: event.summary_es,
    source: event.source_url,
    description: event.summary_es,
    link: event.source_url,
    verified: true
  }));

  return {
    ...entity,
    timeline: formattedEvents
  } as Entity;
}

const CategoryTag = ({ type }: { type: string }) => {
  const styles: Record<string, string> = {
    'RESOLUCIÓN JUDICIAL': 'bg-black text-white border-black',
    'REPORTE CIUDADANO': 'bg-white text-black border-black',
    'INFRACCIÓN ACODECO': 'bg-white text-red-700 border-red-700',
    'default': 'bg-white text-gray-800 border-gray-400'
  };
  const currentStyle = styles[type] || styles['default'];
  return (
    <span className={`text-[10px] font-mono tracking-widest uppercase px-2 py-1 border font-bold ${currentStyle}`}>
      {type}
    </span>
  );
};

export default async function DetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entity = await getEntity(slug);

  if (!entity) {
    notFound();
  }

  const timeline = entity.timeline || [];
  const officialEvents = timeline.filter(e => 
    e.type === 'INFRACCIÓN ACODECO' || 
    e.type === 'RESOLUCIÓN JUDICIAL' || 
    e.type === 'SANCION' ||
    e.type === 'ACODECO INFRACTION'
  );
  const newsEvents = timeline.filter(e => 
    e.type === 'NEWS MENTION' || 
    e.type === 'MENCION PRENSA'
  );
  const otherEvents = timeline.filter(e => 
    !officialEvents.includes(e) && !newsEvents.includes(e)
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-in slide-in-from-bottom-4 duration-500">
      <Link 
        href="/"
        className="flex items-center text-sm font-bold uppercase tracking-widest mb-8 hover:bg-gray-100 px-3 py-2 -ml-3 transition-colors w-fit"
      >
        <ArrowLeft size={16} className="mr-2" />
        Volver al Directorio
      </Link>

      {/* Entity Header */}
      <div className="border-b-[4px] border-black pb-8 mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500 font-bold">Expediente Público</span>
            <span className="text-[10px] bg-black text-white px-2 py-0.5 uppercase tracking-widest font-mono font-bold">Verificado</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-serif font-black tracking-tight">{entity.name}</h1>
        </div>
        
        <div className="bg-white border border-black p-4 min-w-[200px]">
          <div className="text-[10px] font-mono uppercase text-gray-400 mb-1 font-bold">Estado Actual</div>
          <div className={`text-xl font-bold font-serif flex items-center gap-2 ${
            entity.status === 'Sancionada' ? 'text-red-700' : 
            entity.status === 'En Vigilancia' ? 'text-orange-700' : 'text-black'
          }`}>
            <AlertTriangle size={20} />
            {entity.status.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Main Column - Timeline */}
        <div className="lg:col-span-8">
          
          {/* Section 1: Official Sanctions */}
          <section className="mb-16">
            <h2 className="text-2xl font-serif font-bold uppercase border-b-2 border-red-700 text-red-700 pb-2 mb-8 tracking-tighter flex items-center gap-2">
              <ShieldCheck size={24} />
              Edictos y Sanciones Oficiales
            </h2>
            
            <div className="relative border-l-2 border-red-100 ml-4 space-y-10 pb-4">
              {officialEvents.length > 0 ? officialEvents.map((item) => (
                <div key={item.id} className="relative pl-8">
                  <div className="absolute w-3 h-3 bg-red-700 rounded-full -left-[7px] top-1.5 ring-4 ring-white"></div>
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <CategoryTag type={item.type} />
                    <span className="text-[11px] font-mono text-gray-400 font-bold">{item.date}</span>
                  </div>
                  <h3 className="text-xl font-serif font-bold mb-3 leading-snug">{item.title}</h3>
                  <div className="flex items-center gap-4 text-[10px] font-mono bg-red-50/50 p-2 border border-red-100 uppercase tracking-tighter">
                    <span className="text-red-700 font-bold">Expediente Oficial:</span>
                    <span className="font-bold truncate max-w-[200px]">{item.source}</span>
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 hover:underline text-red-700 font-bold">
                        Ver Edicto <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              )) : (
                <div className="pl-8 py-4 border border-dashed border-gray-200 bg-gray-50/30">
                  <p className="text-gray-400 italic font-serif text-sm">No se registran sanciones administrativas de ACODECO para esta entidad.</p>
                </div>
              )}
            </div>
          </section>

          {/* Section 2: News & Media */}
          <section className="mb-16 opacity-80">
            <h2 className="text-xl font-serif font-bold uppercase border-b border-black pb-2 mb-8 tracking-tighter flex items-center gap-2">
              <Newspaper size={20} className="text-gray-500" />
              Menciones en Prensa y Noticias
            </h2>
            
            <div className="relative border-l-2 border-gray-200 ml-4 space-y-8">
              {newsEvents.length > 0 ? newsEvents.map((item) => (
                <div key={item.id} className="relative pl-8">
                  <div className="absolute w-2 h-2 bg-gray-400 rounded-full -left-[5px] top-1.5 ring-4 ring-white"></div>
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <span className="text-[9px] font-mono tracking-widest uppercase px-2 py-0.5 border border-gray-300 text-gray-500 font-bold">Noticia</span>
                    <span className="text-[10px] font-mono text-gray-400 font-bold">{item.date}</span>
                  </div>
                  <h3 className="text-lg font-serif font-bold mb-2 leading-tight text-gray-800">{item.title}</h3>
                  <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-tighter text-gray-400">
                    <span className="truncate max-w-[150px]">{new URL(item.source).hostname}</span>
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="hover:text-black flex items-center gap-1">
                        Leer Artículo <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              )) : (
                <div className="pl-8">
                  <p className="text-gray-400 italic font-serif text-sm">No se registran menciones en prensa reciente.</p>
                </div>
              )}
            </div>
          </section>

          {/* Section 3: Citizen Reports (New!) */}
          <section>
            <h2 className="text-xl font-serif font-bold uppercase border-b border-black pb-2 mb-8 tracking-tighter flex items-center gap-2">
              <AlertTriangle size={20} className="text-orange-500" />
              Reportes Ciudadanos Recientes
            </h2>
            <div className="bg-orange-50 border-2 border-orange-200 p-6">
              <p className="text-sm font-serif italic text-orange-800 mb-0">
                Esta sección contiene quejas y reportes directos de consumidores actualmente en proceso de validación.
              </p>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Trust/Info Box */}
          <div className="bg-white border border-gray-300 p-6 relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-black"></div>
            <h3 className="font-bold uppercase tracking-widest text-[11px] mb-4 flex items-center gap-2">
              <Info size={16} />
              Sobre este registro
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-4 font-serif italic">
              La información presentada en este perfil es una recopilación automatizada y curada de fuentes públicas, fallos judiciales y reportes ciudadanos verificados.
            </p>
            <p className="text-[10px] font-mono text-gray-400 bg-gray-50 p-2 border border-gray-200 font-bold uppercase tracking-tighter">
              Última actualización: {new Date(entity.updated_at).toLocaleDateString('es-PA')}
            </p>
          </div>

          {/* Action Box */}
          <div className="border-[2px] border-black p-6 text-center bg-black text-white">
            <ShieldCheck size={32} className="mx-auto mb-4 opacity-80" />
            <h3 className="font-serif font-bold text-xl mb-2">¿Tiene información adicional?</h3>
            <p className="text-sm text-gray-300 mb-6 font-serif italic">
              Aporte de manera segura a este expediente. Aceptamos documentos y testimonios verificables.
            </p>
            <Link 
              href="/reportar"
              className="block w-full bg-white text-black font-bold uppercase py-3 hover:bg-gray-200 transition-colors tracking-widest"
            >
              Aportar Evidencia
            </Link>
          </div>

          {/* API Access */}
          <div className="border border-gray-200 p-4 mt-8">
            <h4 className="text-[10px] font-bold uppercase text-gray-400 mb-2 font-mono tracking-widest">Acceso Programático</h4>
            <code className="block bg-gray-50 p-2 text-[10px] text-gray-500 break-all font-mono">
              GET /api/entities/{entity.slug}
            </code>
          </div>

        </div>
      </div>
    </div>
  );
}
