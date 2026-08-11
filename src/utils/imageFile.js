// ─────────────────────────────────────────────────────────────────────────────
// src/utils/imageFile.js
//
// Convierte un archivo de imagen (input file / drag&drop) a un data URL ya
// redimensionado, para guardarlo en el store local mientras no hay backend
// de fotos todavía. Cuando se conecte Supabase Storage, este archivo es el
// único que cambia: en vez de `resolve(dataUrl)` se sube el blob con
// `supabase.storage.from('prendas').upload(...)` y se resuelve con la URL
// pública que devuelve Supabase — nada más en la app necesita cambiar,
// porque todos los componentes ya trabajan con `image.url` como string.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_WIDTH = 1000;
const JPEG_QUALITY = 0.82;

/**
 * @param {File} file
 * @returns {Promise<{ url: string, name: string }>}
 */
export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith("image/")) {
      reject(new Error("El archivo no es una imagen."));
      return;
    }
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
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({
          url: canvas.toDataURL("image/jpeg", JPEG_QUALITY),
          name: file.name,
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Procesa varios archivos en paralelo, ignorando los que no sean imágenes válidas. */
export async function filesToImages(fileList) {
  const files = Array.from(fileList || []);
  const results = await Promise.allSettled(files.map(fileToImage));
  return results.filter(r => r.status === "fulfilled").map(r => r.value);
}
