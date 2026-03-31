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
  status: string;
  summary: string;
  description_es?: string;
  description_en?: string;
  updated_at: string;
  timeline: TimelineEvent[];
};

async function getEntity(slug: string): Promise<Entity | null> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/entities/${slug}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error('Error fetching entity:', error);
    return null;
  }
}

const CategoryTag = ({ type }: { type: string }) => {
  const styles: Record<string, string> = {
    'RESOLUCIÓN JUDICIAL': 'bg-black text-white border-black',
    'REPORTE CIUDADANO': 'bg-white text-black border-black',
    'INFRACCIÓN ACODECO': 'bg-red-50 text-red-900 border-red-900',
    'default': 'bg-gray-100 text-gray-800 border-gray-300'
  };
  const currentStyle = styles[type] || styles['default'];
  return (
    <span className={`text-[10px] font-mono tracking-widest uppercase px-2 py-1 border ${currentStyle}`}>
      {type.replace(/_/g, ' ')}
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
      <div className="border-b-[3px] border-black pb-8 mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-mono uppercase tracking-widest text-gray-500">Expediente Público</span>
            <span className="text-[10px] bg-black text-white px-2 py-0.5 uppercase tracking-widest font-mono">Verificado</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-serif font-black tracking-tight">{entity.name}</h1>
        </div>
        
        <div className="bg-gray-50 border border-gray-200 p-4 min-w-[200px]">
          <div className="text-xs font-mono uppercase text-gray-500 mb-1">Estado Actual</div>
          <div className={`text-xl font-bold font-serif flex items-center gap-2 ${
            entity.status === 'Sancionada' ? 'text-red-700' : 
            entity.status === 'En Vigilancia' ? 'text-orange-700' : 'text-black'
          }`}>
            <AlertTriangle size={20} />
            {entity.status}
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Main Column - Timeline */}
        <div className="lg:col-span-8">
          <h2 className="text-2xl font-serif font-bold uppercase border-b border-black pb-2 mb-8">Historial Documentado</h2>
          
          <div className="relative border-l-2 border-gray-200 ml-4 space-y-12 pb-8">
            {timeline.length > 0 ? timeline.map((item) => (
              <div key={item.id} className="relative pl-8">
                {/* Timeline node */}
                <div className="absolute w-3 h-3 bg-black rounded-full -left-[7px] top-1.5 ring-4 ring-white"></div>
                
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <CategoryTag type={item.type} />
                  <span className="text-sm font-mono text-gray-500">{item.date}</span>
                </div>
                
                <h3 className="text-xl font-serif font-bold mb-3 leading-snug">{item.title}</h3>
                
                <p className="text-gray-700 mb-4 leading-relaxed">
                  {item.description}
                </p>
                
                <div className="flex items-center gap-4 text-sm font-mono bg-gray-50 p-3 border border-gray-200">
                  <span className="text-gray-500">Fuente:</span>
                  <span className="font-bold truncate max-w-[200px]">{item.source}</span>
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 hover:underline text-black">
                      Ver original <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            )) : (
              <p className="text-gray-500 italic font-serif">No hay eventos registrados en el historial de esta entidad.</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Trust/Info Box */}
          <div className="bg-slate-50 border border-slate-200 p-6 relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-black"></div>
            <h3 className="font-bold uppercase tracking-widest text-sm mb-4 flex items-center gap-2">
              <Info size={16} />
              Sobre este registro
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              La información presentada en este perfil es una recopilación automatizada y curada de fuentes públicas, fallos judiciales y reportes ciudadanos verificados.
            </p>
            <p className="text-xs font-mono text-gray-500 bg-white p-2 border border-gray-200">
              Última actualización: {new Date(entity.updated_at).toLocaleDateString('es-PA')}
            </p>
          </div>

          {/* Action Box */}
          <div className="border-2 border-black p-6 text-center bg-black text-white">
            <ShieldCheck size={32} className="mx-auto mb-4 opacity-80" />
            <h3 className="font-serif font-bold text-xl mb-2">¿Tiene información adicional?</h3>
            <p className="text-sm text-gray-400 mb-6">
              Aporte de manera segura a este expediente. Aceptamos documentos y testimonios verificables.
            </p>
            <Link 
              href="/reportar"
              className="block w-full bg-white text-black font-bold uppercase py-3 hover:bg-gray-200 transition-colors"
            >
              Aportar Evidencia
            </Link>
          </div>

          {/* API Access */}
          <div className="border border-gray-200 p-4 mt-8">
            <h4 className="text-xs font-bold uppercase text-gray-400 mb-2">Acceso Programático</h4>
            <code className="block bg-gray-100 p-2 text-[10px] text-gray-600 break-all">
              GET /api/entities/{entity.slug}
            </code>
          </div>

        </div>
      </div>
    </div>
  );
}
