import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-20 flex flex-col items-center justify-center animate-in fade-in duration-500">
      <div className="text-center space-y-6">
        <h2 className="text-9xl font-serif font-black tracking-tighter text-black">404</h2>
        <div className="space-y-2">
          <h3 className="text-2xl font-serif font-bold uppercase border-b-2 border-black pb-2">Página No Encontrada</h3>
          <p className="text-lg text-gray-600 font-serif italic max-w-md mx-auto">
            Lo sentimos, el expediente o recurso que busca no existe en nuestro directorio o ha sido removido.
          </p>
        </div>
        
        <div className="pt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/"
            className="flex items-center justify-center gap-2 px-8 py-4 bg-black text-white font-bold uppercase tracking-widest hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft size={18} />
            Volver al Directorio
          </Link>
          <Link 
            href="/"
            className="flex items-center justify-center gap-2 px-8 py-4 border-2 border-black text-black font-bold uppercase tracking-widest hover:bg-gray-50 transition-colors"
          >
            <Search size={18} />
            Nueva Búsqueda
          </Link>
        </div>
      </div>

      <div className="mt-20 max-w-2xl text-center border-t border-gray-200 pt-8">
        <p className="text-xs font-mono text-gray-400 uppercase tracking-widest font-bold">
          Si cree que esto es un error, por favor contacte a nuestro equipo de soporte.
        </p>
      </div>
    </div>
  );
}
