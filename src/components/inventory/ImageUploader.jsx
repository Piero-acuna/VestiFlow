// ─────────────────────────────────────────────────────────────────────────────
// src/components/inventory/ImageUploader.jsx
//
// Zona de arrastrar-y-soltar (o click) para las fotos de una prenda. Guarda
// cada imagen como { id, url } — hoy `url` es un data URL local (ver
// utils/imageFile.js), mañana será la URL pública que devuelva Supabase
// Storage. La primera foto de la lista es la "portada" que se ve en la
// tarjeta del catálogo; se puede reordenar arrastrando o con el botón ★.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef } from "react";
import { ImagePlus, X, Star, Loader2 } from "lucide-react";
import { filesToImages } from "../../utils/imageFile";

export default function ImageUploader({ images, onChange, companyId }) {
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  async function handleFiles(fileList) {
    setProcessing(true);
    setError("");
    const newImages = await filesToImages(fileList, companyId);
    if (newImages.length === 0 && fileList?.length > 0) {
      setError("No se pudo subir la(s) foto(s). Intenta de nuevo.");
    }
    onChange([...images, ...newImages.map(img => ({ id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...img }))]);
    setProcessing(false);
  }

  function removeImage(id) {
    onChange(images.filter(img => img.id !== id));
  }
  function makeCover(id) {
    const img = images.find(i => i.id === id);
    if (!img) return;
    onChange([img, ...images.filter(i => i.id !== id)]);
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed text-center transition-colors ${
          dragOver ? "border-amber-500 bg-amber-500/5" : "border-slate-700 hover:border-slate-600"
        }`}>
        {processing
          ? <Loader2 size={20} className="animate-spin text-amber-400" />
          : <ImagePlus size={20} className="text-slate-500" />}
        <p className="text-xs text-slate-400">
          {processing ? "Procesando fotos…" : "Arrastra fotos aquí o haz clic para elegir"}
        </p>
        <p className="text-[10px] text-slate-600">La primera foto es la portada del catálogo</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {error && <p className="text-[11px] text-red-400 mt-1.5">{error}</p>}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {images.map((img, i) => (
            <div key={img.id} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-slate-700 flex-shrink-0">
              <img src={img.url} alt="" className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute top-0.5 left-0.5 bg-amber-500 text-slate-900 rounded p-0.5"><Star size={9} fill="currentColor" /></span>
              )}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                {i !== 0 && (
                  <button type="button" onClick={() => makeCover(img.id)} title="Hacer portada"
                    className="p-1 bg-slate-800 hover:bg-amber-500 hover:text-slate-900 rounded text-slate-300 transition-colors">
                    <Star size={11} />
                  </button>
                )}
                <button type="button" onClick={() => removeImage(img.id)} title="Quitar"
                  className="p-1 bg-slate-800 hover:bg-red-500 rounded text-slate-300 transition-colors">
                  <X size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
