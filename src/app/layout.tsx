import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Lock, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Registro Panamá — Directorio de Transparencia Empresarial',
    template: '%s | Registro Panamá',
  },
  description:
    'Directorio público de transparencia y credibilidad empresarial en Panamá. Verifica el historial de infracciones, auditorías y estado de empresas panameñas.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-screen bg-white text-black font-sans selection:bg-black selection:text-white flex flex-col">
        {/* Top Bar - Security Indicator */}
        <div className="bg-gray-100 border-b border-gray-200 text-[10px] md:text-xs py-1.5 px-4 flex justify-center items-center gap-2 font-mono text-gray-600">
          <Lock size={12} />
          <span>CONEXIÓN SEGURA Y ENCRIPTADA. PORTAL DE TRANSPARENCIA PANAMÁ.</span>
        </div>

        {/* Masthead Header */}
        <header className="max-w-6xl w-full mx-auto px-4 py-8 md:py-12 flex flex-col items-center border-b-[6px] border-black">
          <div className="w-full flex flex-col md:flex-row justify-between items-center md:items-start mb-6 gap-4">
            <div className="text-xs font-mono uppercase text-gray-500 tracking-widest order-2 md:order-1">
              {new Date().toLocaleDateString('es-PA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="flex gap-4 order-1 md:order-2">
              <Link href="/" className="text-sm font-bold uppercase hover:underline underline-offset-4">
                Directorio
              </Link>
              <Link 
                href="/reportar"
                className="text-sm font-bold uppercase bg-black text-white px-3 py-1 hover:bg-gray-800 transition-colors flex items-center gap-2"
              >
                <ShieldCheck size={16} />
                Enviar Reporte
              </Link>
            </div>
          </div>
          
          <Link href="/">
            <h1 className="text-5xl md:text-8xl font-serif font-black tracking-tighter text-center cursor-pointer hover:opacity-80 transition-opacity">
              Registro Panamá
            </h1>
          </Link>
          <p className="mt-4 text-lg md:text-xl font-serif italic text-gray-600 max-w-2xl text-center">
            El directorio independiente de transparencia corporativa. Busque historiales legales, sanciones y quejas ciudadanas.
          </p>
        </header>

        <main className="flex-grow">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-black mt-24 py-12 max-w-6xl w-full mx-auto px-4 flex flex-col md:flex-row justify-between text-sm font-mono text-gray-500">
          <div>
            <p className="font-bold text-black uppercase mb-2">Registro Panamá © {new Date().getFullYear()}</p>
            <p>Un proyecto independiente para la transparencia ciudadana.</p>
          </div>
          <div className="flex flex-wrap gap-6 mt-6 md:mt-0">
            <a href="#" className="hover:text-black hover:underline">Metodología</a>
            <a href="#" className="hover:text-black hover:underline">Privacidad</a>
            <a href="#" className="hover:text-black hover:underline">API & Bots</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
