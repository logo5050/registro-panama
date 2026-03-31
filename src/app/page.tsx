'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  ChevronRight, 
} from 'lucide-react';
import Link from 'next/link';

type Entity = {
  id: string;
  name: string;
  slug: string;
  status: string;
  summary: string;
  date: string;
};

export default function Home() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('TODAS');

  const FILTER_OPTIONS = [
    { label: 'TODAS', value: 'TODAS' },
    { label: 'RESOLUCIONES', value: 'Resoluciones' },
    { label: 'INFRACCIONES', value: 'Infracciones' },
    { label: 'REPORTES CIUDADANOS', value: 'Reportes Ciudadanos' }
  ];

  useEffect(() => {
    fetchEntities();
  }, [statusFilter]);

  const fetchEntities = async (query = '') => {
    setLoading(true);
    try {
      let url = `/api/entities?search=${encodeURIComponent(query)}`;
      if (statusFilter !== 'TODAS') {
        url += `&status=${encodeURIComponent(statusFilter)}`;
      }
      const res = await fetch(url);
      
      if (!res.ok) {
        console.error('API responded with error:', res.status);
        setEntities([]);
        return;
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        setEntities(data);
      } else {
        console.error('API data is not an array:', data);
        setEntities([]);
      }
    } catch (error) {
      console.error('Error fetching entities:', error);
      setEntities([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEntities(search);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-in fade-in duration-500">
      {/* Search Section */}
      <section className="mb-16">
        <form onSubmit={handleSearch} className="max-w-4xl mx-auto flex flex-col items-center">
          <div className="w-full relative flex items-center border-[1.5px] border-black p-1">
            <Search className="ml-4 text-gray-400" size={24} />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa, institución o persona jurídica..." 
              className="w-full pl-4 pr-4 py-4 text-xl rounded-none focus:outline-none transition-all font-sans placeholder:italic placeholder:text-gray-400"
            />
            <button 
              type="submit"
              className="px-8 py-4 bg-black text-white font-bold uppercase tracking-wider hover:bg-gray-800 transition-colors"
            >
              BUSCAR
            </button>
          </div>
          
          <div className="mt-6 flex flex-wrap justify-center items-center gap-3 text-[11px] font-mono">
            <span className="text-gray-500 uppercase tracking-widest mr-2 font-bold">FILTROS:</span>
            {FILTER_OPTIONS.map(filter => (
              <button 
                key={filter.value} 
                onClick={() => setStatusFilter(filter.value)}
                className={`border px-4 py-2 transition-colors uppercase font-bold tracking-tight ${
                  statusFilter === filter.value 
                    ? 'bg-black text-white border-black' 
                    : 'bg-white text-black border-gray-300 hover:border-black'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </form>
      </section>

      {/* Reporting Channels Section */}
      <section className="mb-20 grid grid-cols-1 md:grid-cols-2 gap-8 border-[1.5px] border-black p-8 bg-gray-50">
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-serif font-black uppercase tracking-tight">Canales Seguros de Reporte</h2>
          <p className="font-serif italic text-gray-600 leading-relaxed">
            Utilice nuestros canales automatizados para enviar evidencias de manera confidencial y segura.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-6">
          <a 
            href="https://wa.me/message/YOUR_WHATSAPP_LINK" 
            target="_blank" 
            className="flex-1 border-[1.5px] border-black p-4 bg-white hover:bg-black hover:text-white transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest border border-black px-2 group-hover:border-white">Bot de IA</span>
            </div>
            <h3 className="font-serif font-bold text-lg mb-1 uppercase">WhatsApp</h3>
            <p className="text-[11px] font-mono leading-tight">Envío de audio, fotos y videos de denuncias en tiempo real.</p>
          </a>
          <a 
            href="https://instagram.com/registro.panama" 
            target="_blank" 
            className="flex-1 border-[1.5px] border-black p-4 bg-white hover:bg-black hover:text-white transition-all group"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest border border-black px-2 group-hover:border-white">Mensaje Directo</span>
            </div>
            <h3 className="font-serif font-bold text-lg mb-1 uppercase">Instagram</h3>
            <p className="text-[11px] font-mono leading-tight">Siga las actualizaciones e interactúe con nuestro equipo de IA.</p>
          </a>
        </div>
      </section>

      {/* Grid Section - Newspaper Style */}
      <section>
        <h2 className="text-2xl font-serif font-bold uppercase border-b-2 border-black pb-2 mb-8 flex justify-between items-end">
          <span>Actualizaciones Recientes</span>
          <span className="text-sm font-mono font-normal text-gray-500">
            {loading ? 'Cargando...' : `${entities.length} resultados`}
          </span>
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="animate-pulse flex flex-col gap-4">
                <div className="h-4 bg-gray-100 w-1/4"></div>
                <div className="h-8 bg-gray-100 w-3/4"></div>
                <div className="h-20 bg-gray-100 w-full"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {entities.map((entity, idx) => (
              <Link 
                href={`/registro/${entity.slug}`}
                key={entity.id} 
                className={`group cursor-pointer flex flex-col ${idx % 3 !== 0 ? 'md:border-l border-gray-200 md:pl-8' : ''} ${idx >= 3 ? 'border-t border-gray-200 pt-8' : ''}`}
              >
                <article className="flex flex-col h-full">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 font-bold">{entity.date}</span>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 border ${
                      entity.status === 'En Vigilancia' ? 'border-orange-500 text-orange-700' :
                      entity.status === 'Sancionada' ? 'border-red-600 text-red-600' :
                      'border-black text-black'
                    }`}>
                      {entity.status}
                    </span>
                  </div>
                  <h3 className="text-2xl font-serif font-bold mb-3 group-hover:underline decoration-2 underline-offset-4 leading-tight">
                    {entity.name}
                  </h3>
                  <p className="font-sans text-gray-700 text-sm leading-relaxed mb-4 flex-grow line-clamp-4">
                    {entity.summary || 'Ver expediente completo para más detalles sobre el historial y estado de esta entidad.'}
                  </p>
                  <div className="flex items-center text-xs font-bold uppercase tracking-wider mt-auto group-hover:translate-x-1 transition-transform">
                    Ver Expediente <ChevronRight size={14} className="ml-1" />
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}

        {!loading && entities.length === 0 && (
          <div className="text-center py-20 border-2 border-dashed border-gray-200">
            <p className="text-gray-500 font-serif italic text-lg">No se encontraron entidades que coincidan con su búsqueda.</p>
          </div>
        )}
      </section>
    </div>
  );
}
