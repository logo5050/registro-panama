import { supabasePublic } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function LeadEvidenceVault({ params }: Props) {
  const { id } = await params;

  const { data: lead, error } = await supabasePublic
    .from('multimedia_reports')
    .select('*, businesses(*)')
    .eq('id', id)
    .single();

  if (error || !lead) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black font-sans">
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/lawyer-portal" className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">
            ← Evidence <span className="text-blue-600">Vault</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-green-600 uppercase tracking-widest bg-green-50 dark:bg-green-950/30 px-3 py-1 rounded-full border border-green-100 dark:border-green-900">
              Unlocked Access
            </span>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 md:p-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          
          {/* Main Evidence Content */}
          <div className="lg:col-span-2 space-y-12">
            <section>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6 italic">Raw Conversational Evidence</h2>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
                <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Original Transcription (Whisper AI)</p>
                  <p className="text-lg text-slate-900 dark:text-slate-100 leading-relaxed italic font-medium">
                    &ldquo;{lead.private_data?.raw_transcription || lead.complaint_text}&rdquo;
                  </p>
                </div>
                <div className="p-8">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Multimedia Attachments</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {lead.evidence_urls && lead.evidence_urls.length > 0 ? (
                      lead.evidence_urls.map((url: string, idx: number) => (
                        <div key={idx} className="aspect-square bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700">
                          <span className="text-2xl">📄</span>
                          <p className="absolute mt-12 text-[10px] font-bold text-slate-400">evidence_{idx+1}.jpg</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400 italic">No multimedia files attached.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-6 italic">AI Legal Audit (Premium)</h2>
              <div className="bg-blue-600 rounded-3xl p-8 text-white shadow-xl shadow-blue-500/20">
                <div className="mb-8">
                  <h3 className="text-xs font-bold uppercase tracking-widest opacity-70 mb-3">Law 45 Articles Violated</h3>
                  <ul className="space-y-2">
                    {lead.premium_report?.law_45_articles?.map((article: string, idx: number) => (
                      <li key={idx} className="flex items-center gap-3 bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                        <span className="text-blue-200 font-bold">#</span>
                        <span className="text-sm font-bold">{article}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mb-8">
                  <h3 className="text-xs font-bold uppercase tracking-widest opacity-70 mb-3">Matching ACODECO Precedents</h3>
                  <div className="space-y-3">
                    {lead.premium_report?.matching_precedents?.map((precedent: string, idx: number) => (
                      <div key={idx} className="bg-slate-900/40 p-4 rounded-xl border border-white/5 text-xs leading-relaxed">
                        {precedent}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest opacity-70 mb-3">Draft Demand Letter</h3>
                  <div className="bg-white text-slate-900 p-6 rounded-2xl font-mono text-xs leading-relaxed whitespace-pre-wrap border-t-4 border-blue-400">
                    {lead.premium_report?.demand_letter_draft}
                  </div>
                  <button className="mt-4 w-full py-3 bg-white text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors uppercase tracking-widest">
                    Copy Letter to Clipboard
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Sidebar / Entity Details */}
          <aside className="space-y-6">
            <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Entity Details</h3>
              <div className="mb-6">
                <p className="text-2xl font-black text-slate-900 dark:text-white mb-1">{lead.businesses?.name}</p>
                <Link href={`/registro/${lead.businesses?.slug}`} className="text-xs text-blue-600 hover:underline">View Public Profile →</Link>
              </div>
              
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-[10px] font-bold text-slate-400 uppercase">RUC / DV</dt>
                  <dd className="text-slate-900 dark:text-white font-mono">{lead.businesses?.ruc || 'N/A'}-{lead.businesses?.dv || '0'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-slate-400 uppercase">Resolved Social Handle</dt>
                  <dd className="text-blue-600 font-bold">{lead.social_handle || '@anonymous'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold text-slate-400 uppercase">Submission Date</dt>
                  <dd className="text-slate-900 dark:text-white font-mono">{new Date(lead.created_at).toLocaleString()}</dd>
                </div>
              </dl>
            </div>

            <div className="p-8 bg-slate-900 dark:bg-slate-800 text-white rounded-3xl border border-slate-800">
              <h3 className="text-lg font-bold mb-4 italic">Next Steps</h3>
              <ul className="space-y-4 text-xs text-slate-400">
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">1</span>
                  <p>Contact the complainant using the secure bridge.</p>
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">2</span>
                  <p>Send the AI-drafted Demand Letter via registered email.</p>
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-slate-700 text-white flex items-center justify-center shrink-0 text-[10px] font-bold">3</span>
                  <p>File a formal complaint with ACODECO using the Evidence Vault as PDF.</p>
                </li>
              </ul>
              <button className="mt-8 w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-500/20">
                Contact Client
              </button>
            </div>
          </aside>

        </div>
      </main>
    </div>
  );
}
