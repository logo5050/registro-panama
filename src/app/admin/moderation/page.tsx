import { supabaseAdmin } from '@/lib/supabase';
import { Newspaper, CheckCircle, XCircle, ExternalLink, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

// Force dynamic to ensure we get fresh data from Supabase
export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const { data: reports, error } = await supabaseAdmin
    .from('multimedia_reports')
    .select(`
      *,
      businesses (
        name,
        slug
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="p-8 text-red-600 bg-red-50 border-2 border-red-200 font-serif">
        Error loading reports: {error.message}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f9f7f2] p-4 md:p-8 font-serif text-slate-900">
      {/* Newspaper Header */}
      <header className="max-w-6xl mx-auto border-b-4 border-slate-900 pb-4 mb-8">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter">
              Mesa de Moderación
            </h1>
            <p className="text-sm font-bold text-slate-600 mt-2 uppercase tracking-widest">
              Registro Panamá — Panel Administrativo Interno
            </p>
          </div>
          <div className="hidden md:block text-right">
            <p className="text-sm font-bold uppercase">{new Date().toLocaleDateString('es-PA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p className="text-xs text-slate-500 uppercase">Filtro: Pendientes de Revisión</p>
          </div>
        </div>
      </header>

      {/* Reports Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {reports?.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-300 rounded-lg">
            <Newspaper className="mx-auto h-12 w-12 text-slate-300 mb-4" />
            <p className="text-xl text-slate-500">No hay reportes pendientes de moderación.</p>
          </div>
        ) : (
          reports?.map((report) => (
            <article key={report.id} className="bg-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] p-5 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <span className="bg-slate-900 text-white text-[10px] font-bold px-2 py-1 uppercase tracking-widest">
                  {report.social_handle || 'Vía Web'}
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  {new Date(report.created_at).toLocaleDateString()}
                </span>
              </div>

              <h2 className="text-xl font-bold leading-tight mb-2 min-h-[3rem]">
                {report.businesses?.name || report.entity_name_manual || 'Empresa Desconocida'}
              </h2>

              <div className="bg-slate-50 border border-slate-200 p-3 mb-4 flex-grow">
                <p className="text-sm italic leading-relaxed text-slate-700">
                  "{report.public_summary}"
                </p>
              </div>

              {/* Evidence Preview */}
              {report.evidence_urls?.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {report.evidence_urls.slice(0, 3).map((url: string, i: number) => (
                    <div key={i} className="aspect-square bg-slate-200 border border-slate-300 overflow-hidden relative group">
                      <img 
                        src={url} 
                        alt="Evidencia" 
                        className="object-cover w-full h-full grayscale hover:grayscale-0 transition-all cursor-zoom-in"
                      />
                      {i === 2 && report.evidence_urls.length > 3 && (
                        <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center text-white text-xs font-bold">
                          +{report.evidence_urls.length - 3}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Stats / Score */}
              <div className="flex items-center gap-4 mb-6 pt-4 border-t border-slate-100">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Lead Score</span>
                  <span className="text-sm font-black text-slate-900">{(report.lead_score * 100).toFixed(0)}%</span>
                </div>
                <div className="flex flex-col border-l border-slate-200 pl-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Precedentes</span>
                  <span className="text-sm font-black text-slate-900">Calculando...</span>
                </div>
              </div>

              {/* Action Buttons (Server actions or Client component would go here) */}
              <div className="grid grid-cols-2 gap-3">
                <button className="flex items-center justify-center gap-2 border-2 border-slate-900 py-2 text-xs font-bold uppercase hover:bg-red-50 transition-colors">
                  <XCircle className="w-4 h-4" /> Rechazar
                </button>
                <button className="flex items-center justify-center gap-2 bg-slate-900 text-white py-2 text-xs font-bold uppercase hover:bg-slate-800 transition-colors">
                  <CheckCircle className="w-4 h-4" /> Aprobar
                </button>
              </div>
              
              <Link 
                href={`/admin/moderation/${report.id}`}
                className="mt-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
              >
                Ver Expediente Completo
              </Link>
            </article>
          ))
        )}
      </div>

      <footer className="max-w-6xl mx-auto mt-20 pt-8 border-t border-slate-300 text-center">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Propiedad de Registro Panamá — © 2026
        </p>
      </footer>
    </main>
  );
}
