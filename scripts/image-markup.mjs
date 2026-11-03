// The legacy in-body hook passes pre-escaped src and alt; preserve it when no derivatives exist.
export function renderPicture(image, options = {}) {
  if (!image.variants) return `<img src="${image.src}" alt="${image.alt}" loading="lazy">`;
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const sizes = options.kind === "card" ? "(max-width: 600px) calc(100vw - 32px), (max-width: 1024px) 50vw, 33vw" : "(max-width: 768px) calc(100vw - 32px), 800px";
  const set = type => image.variants.filter(v => v.mime === type).sort((a,b) => a.width-b.width).map(v => `${esc(v.path)} ${v.width}w`).join(", ");
  const sources = ["image/avif", "image/webp"].map(type => `<source type="${type}" srcset="${set(type)}" sizes="${sizes}">`).join("");
  const jpg = image.variants.filter(v => v.mime === "image/jpeg").sort((a,b) => a.width-b.width);
  if (!jpg.length || !set("image/avif") || !set("image/webp")) throw new Error("picture requires AVIF, WebP and JPEG variants");
  const priority = options.lcp === true ? 'fetchpriority="high" loading="eager"' : 'loading="lazy"';
  return `<picture>${sources}<img src="${esc(jpg[0].path)}" srcset="${set("image/jpeg")}" sizes="${sizes}" width="${image.width}" height="${image.height}" alt="${esc(image.alt || "")}" ${priority} decoding="async"></picture>`;
}
