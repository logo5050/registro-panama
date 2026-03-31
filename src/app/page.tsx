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
  const [statusFilter, setStatusFilter] = useState('Todas');

  useEffect(() => {
    fetchEntities();
  }, [statusFilter]);

  const fetchEntities = async (query = '') => {
    setLoading(true);
    try {
      let url = `/api/entities?search=${query}`;
      if (statusFilter !== 'Todas') {
        url += `&status=${statusFilter}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setEntities(data);
    } catch (error) {
      console.error('Error fetching entities:', error);
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
        <form onSubmit={handleSearch} className="max-w-3xl mx-auto flex flex-col items-center">
          <div className="w-full relative flex items-center">
            <Search className="absolute left-4 text-gray-400" size={24} />
            <input 
              type="text" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa, institución o persona jurídica..." 
              className="w-full pl-14 pr-4 py-5 text-xl border-2 border-black rounded-none focus:outline-none focus:ring-4 focus:ring-gray-200 transition-all font-serif"
            />
            <button 
              type="submit"
              className="absolute right-2 px-6 py-3 bg-black text-white font-bold uppercase tracking-wider hover:bg-gray-800 transition-colors"
            >
              Buscar
            </button>
          </div>
          
          <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm font-mono">
            <span className="text-gray-500 uppercase tracking-widest mr-2">Filtros:</span>
            {['Todas', 'Limpio', 'Bajo Observación', 'En Vigilancia', 'Sancionada'].map(filter => (
              <button 
                key={filter} 
                onClick={() => setStatusFilter(filter)}
                className={`border px-3 py-1 transition-colors uppercase ${statusFilter === filter ? 'bg-black text-white border-black' : 'border-gray-300 hover:border-black hover:bg-gray-50'}`}
              >
                {filter}
              </button>
            ))}
          </div>
        </form>
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
                <div className="h-4 bg-gray-200 w-1/4"></div>
                <div className="h-8 bg-gray-200 w-3/4"></div>
                <div className="h-20 bg-gray-200 w-full"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {entities.map((entity, idx) => (
              <Link 
                href={`/registro/${entity.slug}`}
                key={entity.id} 
                className={`group cursor-pointer flex flex-col ${idx % 3 !== 0 ? 'md:border-l border-gray-300 md:pl-8' : ''} ${idx >= 3 ? 'border-t border-gray-300 pt-8' : ''}`}
              >
                <article className="flex flex-col h-full">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-mono uppercase tracking-widest text-gray-500">{entity.date}</span>
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
