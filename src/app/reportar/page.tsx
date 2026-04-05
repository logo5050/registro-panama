'use client';

import React, { useState } from 'react';
import { 
  ShieldCheck, 
  FileText, 
  ArrowLeft,
  Lock,
} from 'lucide-react';
import Link from 'next/link';

export default function ReportPage() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    entityName: '',
    reportType: 'Práctica Comercial Injusta',
    description: '',
  });
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const data = new FormData();
    data.append('entityName', formData.entityName);
    data.append('reportType', formData.reportType);
    data.append('description', formData.description);
    if (file) {
      data.append('evidenceFile', file);
    }

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        body: data,
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        alert('Error al enviar el reporte. Por favor intente de nuevo.');
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      alert('Error de conexión. Por favor intente de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-3xl mx-auto py-20 px-4 text-center animate-in fade-in duration-500">
        <ShieldCheck size={64} className="mx-auto mb-6 text-black" />
        <h1 className="text-4xl font-serif font-black mb-4">¡Reporte Recibido!</h1>
        <p className="text-lg text-gray-600 mb-8 font-serif italic">
          Gracias por contribuir a la transparencia. Su reporte ha sido guardado de forma segura y será revisado por nuestro equipo.
        </p>
        <Link 
          href="/"
          className="inline-block px-8 py-4 bg-black text-white font-bold uppercase tracking-wider hover:bg-gray-800 transition-colors"
        >
          Volver al Directorio
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-in fade-in duration-500">
      <Link 
        href="/"
        className="flex items-center text-sm font-bold uppercase tracking-widest mb-12 hover:bg-gray-100 px-3 py-2 -ml-3 transition-colors w-fit"
      >
        <ArrowLeft size={16} className="mr-2" />
        Cancelar
      </Link>

      <div className="text-center mb-12">
        <ShieldCheck size={48} className="mx-auto mb-6" />
        <h1 className="text-4xl md:text-5xl font-serif font-black tracking-tight mb-4 uppercase">
          Reporte Confidencial
        </h1>
        <p className="text-lg text-gray-600 max-w-xl mx-auto font-serif italic leading-relaxed">
          Su reporte ayuda a mantener la transparencia. Garantizamos la privacidad de sus datos personales. Solo se publicarán los hechos verificados.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8 bg-white p-8 md:p-12 border-[1.5px] border-black relative mb-20">
        {/* ... existing form content ... */}
        {/* Secure connection indicator inside form */}
        <div className="absolute top-0 right-0 bg-black text-white text-[10px] uppercase font-mono px-3 py-1 flex items-center gap-1">
          <Lock size={10} /> Encriptación AES-256
        </div>

        <div className="space-y-4">
          <h3 className="font-bold uppercase tracking-widest text-xs border-b border-black pb-2">1. Detalles de la Entidad</h3>
          {/* ... (rest of form) ... */}
          
          <div>
            <label className="block text-sm font-bold mb-2 uppercase tracking-tighter">Nombre de la Empresa o Entidad *</label>
            <input 
              type="text" 
              required
              value={formData.entityName}
              onChange={(e) => setFormData({...formData, entityName: e.target.value})}
              className="w-full border border-gray-300 p-4 focus:border-black focus:outline-none transition-colors bg-white font-serif italic text-lg"
              placeholder="Ej. Banco Nacional, Constructora X..."
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold uppercase tracking-widest text-xs border-b border-black pb-2 mt-8">2. Naturaleza del Reporte</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className={`border p-4 cursor-pointer transition-colors flex items-start gap-3 bg-white ${formData.reportType === 'Práctica Comercial Injusta' ? 'border-black ring-1 ring-black' : 'border-gray-200 hover:border-black'}`}>
              <input 
                type="radio" 
                name="type" 
                className="mt-1 accent-black" 
                checked={formData.reportType === 'Práctica Comercial Injusta'}
                onChange={() => setFormData({...formData, reportType: 'Práctica Comercial Injusta'})}
              />
              <div>
                <div className="font-bold text-[11px] uppercase tracking-tighter">Práctica Comercial Injusta</div>
                <div className="text-[10px] text-gray-500 mt-1 leading-tight">Cobros indebidos, publicidad engañosa.</div>
              </div>
            </label>
            <label className={`border p-4 cursor-pointer transition-colors flex items-start gap-3 bg-white ${formData.reportType === 'Falla de Servicio Grave' ? 'border-black ring-1 ring-black' : 'border-gray-200 hover:border-black'}`}>
              <input 
                type="radio" 
                name="type" 
                className="mt-1 accent-black" 
                checked={formData.reportType === 'Falla de Servicio Grave'}
                onChange={() => setFormData({...formData, reportType: 'Falla de Servicio Grave'})}
              />
              <div>
                <div className="font-bold text-[11px] uppercase tracking-tighter">Falla de Servicio Grave</div>
                <div className="text-[10px] text-gray-500 mt-1 leading-tight">Interrupciones prologadas, negligencia.</div>
              </div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2 mt-4 uppercase tracking-tighter">Descripción de los hechos *</label>
            <textarea 
              rows={6}
              required
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full border border-gray-300 p-4 focus:border-black focus:outline-none transition-colors bg-white font-sans text-sm leading-relaxed"
              placeholder="Describa de manera objetiva lo sucedido. Incluya fechas y montos si aplica."
            ></textarea>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold uppercase tracking-widest text-xs border-b border-black pb-2 mt-8">3. Evidencia (Opcional pero recomendado)</h3>
          <div className="border border-dashed border-gray-300 p-8 text-center bg-white relative hover:border-black transition-colors">
            <input 
              type="file" 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <FileText className="mx-auto text-gray-400 mb-2" size={32} />
            <p className="text-sm font-bold uppercase tracking-tighter">
              {file ? file.name : 'Arrastre archivos aquí o haga clic para subir'}
            </p>
            <p className="text-[10px] text-gray-500 mt-2 font-mono">Formatos aceptados: PDF, JPG, PNG. Máx 10MB.</p>
          </div>
        </div>

        <hr className="border-t-[1.5px] border-black my-8" />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <p className="text-[10px] text-gray-500 font-mono max-w-sm uppercase leading-tight">
            Al enviar este reporte, un equipo de analistas e IA verificará los datos antes de su publicación en el Registro.
          </p>
          <button 
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-10 py-4 bg-black text-white font-bold uppercase tracking-widest hover:bg-gray-800 transition-colors disabled:bg-gray-400"
          >
            {loading ? 'Enviando...' : 'Enviar Reporte Seguro'}
          </button>
        </div>
        </form>

        {/* Alternative Channels Section */}
        <section className="mt-12 border-t-[1.5px] border-gray-200 pt-12 pb-24">
        <h2 className="text-xl font-serif font-black uppercase tracking-tight mb-6">Otros Canales de Reporte</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="border border-gray-200 p-6 bg-gray-50">
            <h3 className="font-bold uppercase tracking-widest text-xs mb-3">WhatsApp</h3>
            <p className="text-sm text-gray-600 mb-4 font-serif italic">Envíe un mensaje a nuestro bot para iniciar un reporte conversacional.</p>
            <a href="https://wa.me/message/YOUR_WHATSAPP_LINK" target="_blank" className="text-xs font-bold uppercase underline underline-offset-4">Abrir Chat</a>
          </div>
          <div className="border border-gray-200 p-6 bg-gray-50">
            <h3 className="font-bold uppercase tracking-widest text-xs mb-3">Instagram</h3>
            <p className="text-sm text-gray-600 mb-4 font-serif italic">Contáctenos vía DM para enviar evidencias de manera directa.</p>
            <a href="https://instagram.com/registro.panama" target="_blank" className="text-xs font-bold uppercase underline underline-offset-4">Enviar Mensaje</a>
          </div>
        </div>
        </section>
        </div>
        );
        }
