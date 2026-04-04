import { supabaseAdmin } from '@/lib/supabase';
import { getVerifiedLawyer } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function LawyerPortal() {
  // ─── Auth Guard: verified lawyers only ───
  const lawyer = await getVerifiedLawyer();
  if (!lawyer) {
    redirect('/?error=unauthorized');
  }

  // Fetch high-value leads for the B2B dashboard
  const { data: leads, error } = await supabaseAdmin
    .from('multimedia_reports')
    .select('id, entity_name_manual, public_summary, lead_score, status, created_at, businesses(name, slug)')
    .order('lead_score', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching leads:', error);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black font-sans">
      <nav className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">
            Registro Panamá <span className="text-blue-600">Pro</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
              Lawyer Portal
            </span>
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
              {lawyer.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 md:p-12">
        <header className="mb-10">
          <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-2">Lead Marketplace</h1>
          <p className="text-slate-600 dark:text-slate-400">
            High-value consumer complaints mapped to Law 45 precedents.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Feed */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Available Leads ({leads?.length || 0})</h2>
              <div className="flex gap-2">
                <button className="text-xs font-bold px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  Filter by Score
                </button>
              </div>
            </div>

            {leads && leads.length > 0 ? (
              leads.map((lead: any) => (
                <div key={lead.id} className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 hover:shadow-xl transition-all hover:border-blue-500/50">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 group-hover:text-blue-600 transition-colors">
                        {lead.businesses?.name || lead.entity_name_manual || 'Unknown Business'}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded">
                          Complainant Protected
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ID: {lead.id.substring(0, 8)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 justify-end mb-1">
                        <div className="h-2 w-16 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.4)]"
                            style={{ width: `${(lead.lead_score || 0) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-black text-blue-600 dark:text-blue-400">
                          {Math.round((lead.lead_score || 0) * 100)}%
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lead Evidence Score</span>
                    </div>
                  </div>

                  <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-6 italic border-l-2 border-slate-100 dark:border-slate-800 pl-4 font-serif">
                    &ldquo;{lead.public_summary || 'No public summary available.'}&rdquo;
                  </p>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex gap-4">
                      <div className="text-[10px]">
                        <p className="text-slate-400 uppercase font-bold tracking-tighter">Ley 45 Violations</p>
                        <p className="text-slate-900 dark:text-white font-bold">AI Detected</p>
                      </div>
                      <div className="text-[10px]">
                        <p className="text-slate-400 uppercase font-bold tracking-tighter">Status</p>
                        <p className={`font-bold ${lead.status === 'reviewed' ? 'text-green-600' : 'text-amber-600'}`}>
                          {lead.status === 'reviewed' ? 'Verified Proof' : 'AI Analysis Only'}
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/lawyer-portal/leads/${lead.id}`}
                      className="px-6 py-2 bg-slate-900 dark:bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-lg hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/10"
                    >
                      Unlock Evidence Vault
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                <p className="text-slate-400 italic">No high-value leads found at this moment.</p>
              </div>
            )}
          </div>

          {/* Sidebar / Stats */}
          <aside className="space-y-6">
            <div className="p-6 bg-blue-600 rounded-3xl text-white shadow-xl shadow-blue-500/20">
              <h3 className="text-lg font-black mb-1 italic">Verified Partner</h3>
              <p className="text-blue-100 text-xs mb-6 opacity-80">{lawyer.fullName}</p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Leads Bought</p>
                  <p className="text-2xl font-black italic">—</p>
                </div>
                <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Success Rate</p>
                  <p className="text-2xl font-black italic">—</p>
                </div>
              </div>

              <button className="w-full py-3 bg-white text-blue-600 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors shadow-lg">
                Add Credits
              </button>
            </div>

            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Trending Precedents</h3>
              <ul className="space-y-4">
                <li className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
                    <span className="text-xs">⚠️</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Real Estate Fraud</p>
                    <p className="text-[10px] text-slate-400 leading-tight">Increased ACODECO activity in PH management cases.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center shrink-0">
                    <span className="text-xs">⚖️</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Warranty Denials</p>
                    <p className="text-[10px] text-slate-400 leading-tight">New ruling favor consumers in appliance repairs.</p>
                  </div>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
