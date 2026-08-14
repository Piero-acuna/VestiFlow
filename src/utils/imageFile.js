// ─────────────────────────────────────────────────────────────────────────────
// src/utils/imageFile.js
//
// Redimensiona una imagen y la sube al bucket `garment-photos` de Supabase
// Storage. La ruta empieza SIEMPRE con `${companyId}/` porque la política
// de Storage (ver supabase/schema.sql) exige que el primer segmento de la
// ruta coincida con la empresa del usuario autenticado — así ningún
// empleado puede subir ni pisar fotos de otra tienda.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from "../lib/supabaseClient";

const MAX_WIDTH = 1000;
const JPEG_QUALITY = 0.82;

function resizeToBlob(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo procesar la imagen."));
      img.onload = () => {
        const scale = Math.min(1, MAX_WIDTH / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen.")), "image/jpeg", JPEG_QUALITY);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * @param {File} file
 * @param {string} companyId
 * @returns {Promise<{ url: string, name: string, path: string }>}
 */
export async function fileToImage(file, companyId) {
  if (!file || !file.type?.startsWith("image/")) throw new Error("El archivo no es una imagen.");
  if (!companyId) throw new Error("Falta el companyId para subir la foto.");

  const blob = await resizeToBlob(file);
  const path = `${companyId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;

  const { error } = await supabase.storage.from("garment-photos").upload(path, blob, {
    contentType: "image/jpeg", upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("garment-photos").getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, path };
}

/** Sube varios archivos en paralelo, ignorando los que fallen (no son imagen válida, error de red, etc). */
export async function filesToImages(fileList, companyId) {
  const files = Array.from(fileList || []);
  const results = await Promise.allSettled(files.map(f => fileToImage(f, companyId)));
  return results.filter(r => r.status === "fulfilled").map(r => r.value);
}

