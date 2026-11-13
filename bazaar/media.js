// Bazaar photos stored in the Realtime Database (free plan, no Firebase Storage needed).
// An image reference in a product/unit `images` list is either a normal path/URL
// ("/bazaar/img/x/1.webp") or "db:<mediaId>", which lives at catalog/media/<id>:
//   { t: <thumbnail data URL ~480px>, f: <full data URL ~1400px>, w, h, at, kb }
// Lists only ever load the small thumbnail; the full photo loads on the product page.
import { ref, get, set, push, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const escA = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const isDb = r => typeof r === 'string' && r.startsWith('db:');
export const mediaId = r => r.slice(3);

/** <img> HTML for an image reference. size: 't' (thumbnail) or 'f' (full). */
export function mediaImg(src, size = 't', attrs = '') {
  if (!src) return '';
  if (isDb(src)) return `<img src="${BLANK}" data-media="${escA(mediaId(src))}" data-size="${size}" ${attrs}>`;
  return `<img src="${escA(src)}" ${attrs}>`;
}

const cache = new Map();
function load(db, id, size) {
  const k = id + '/' + size;
  if (!cache.has(k)) cache.set(k, get(ref(db, `catalog/media/${id}/${size}`)).then(s => s.val() || (size === 'f' ? load(db, id, 't') : null)).catch(() => null));
  return cache.get(k);
}
/** Prime the cache with a freshly uploaded image so it shows instantly. */
export function primeMedia(id, t, f) { cache.set(id + '/t', Promise.resolve(t)); cache.set(id + '/f', Promise.resolve(f)); }

/** Watches the page and fills in every <img data-media> as it scrolls into view. */
export function autoHydrate(db) {
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); } }), { rootMargin: '400px' }) : null;
  const fill = img => load(db, img.dataset.media, img.dataset.size || 't').then(d => { if (d) img.src = d; else img.classList.add('media-missing'); });
  const scan = root => (root.querySelectorAll ? root.querySelectorAll('img[data-media]:not([data-mq])') : []).forEach(img => { img.dataset.mq = '1'; io ? io.observe(img) : fill(img); });
  scan(document);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches && n.matches('img[data-media]:not([data-mq])')) scan(n.parentNode); else scan(n); } }))).observe(document.body, { childList: true, subtree: true });
}

/* ───────── processing & upload (admin) ───────── */
async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall back to <img> */ }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('unsupported')); im.src = url; });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}
async function encode(src, max, q) {
  const w0 = src.width, h0 = src.height, sc = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * sc), h = Math.round(h0 * sc);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h);
  let b = await new Promise(r => c.toBlob(r, 'image/webp', q));
  if (!b || b.type !== 'image/webp') b = await new Promise(r => c.toBlob(r, 'image/jpeg', q)); // older Safari can't write WebP
  const d = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  return { d, w, h, kb: Math.round(b.size / 1024) };
}
/** Resize + compress a photo and save it. Returns "db:<id>". */
export async function uploadPhoto(db, file) {
  let src;
  try { src = await decode(file); } catch { throw new Error(`${file.name}: this photo format can't be read here. Try a JPEG or PNG (on iPhone: Settings → Camera → Formats → Most Compatible).`); }
  let full = await encode(src, 1400, 0.82);
  if (full.kb > 450) full = await encode(src, 1200, 0.72);
  if (full.kb > 450) full = await encode(src, 1000, 0.65);
  const thumb = await encode(src, 480, 0.72);
  if (src.close) src.close();
  const r = push(ref(db, 'catalog/media')), at = Date.now(), kb = Math.round((full.d.length + thumb.d.length) / 1024);
  await update(ref(db), { [`catalog/media/${r.key}`]: { t: thumb.d, f: full.d, w: full.w, h: full.h, kb, at }, [`catalog/mediaIndex/${r.key}`]: { kb, at } });
  primeMedia(r.key, thumb.d, full.d);
  return 'db:' + r.key;
}
/** Delete uploaded photos (ignores normal paths). */
export function deletePhotos(db, refs) {
  const upd = {}; (refs || []).filter(isDb).forEach(r => { upd[`catalog/media/${mediaId(r)}`] = null; upd[`catalog/mediaIndex/${mediaId(r)}`] = null; });
  return Object.keys(upd).length ? update(ref(db), upd) : Promise.resolve();
}
