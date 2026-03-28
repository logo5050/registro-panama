import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

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
    'Directorio público de transparencia y credibilidad empresarial en Panamá. Verifica el historial de infracciones, auditorías y estado de empresas panameñas. Public business credibility registry for Panama.',
  keywords: [
    'registro empresarial panamá', 'empresas panamá', 'acodeco infracciones',
    'transparencia empresarial', 'panama business registry', 'credibility',
    'GEO Glass', 'auditoría empresarial', 'órgano judicial panamá',
  ],
  openGraph: {
    title: 'Registro Panamá — Directorio de Transparencia Empresarial',
    description: 'Verifica el historial y credibilidad de empresas en Panamá.',
    url: 'https://registro-panama.vercel.app',
    siteName: 'Registro Panamá',
    locale: 'es_PA',
    alternateLocale: 'en_US',
    type: 'website',
  },
  alternates: {
    canonical: 'https://registro-panama.vercel.app',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
