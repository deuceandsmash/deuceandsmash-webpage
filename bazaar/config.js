// Bazaar — shared settings for the public page and the owners' admin.
// Firebase project: deuceandsmash-bazaar (separate from ops and tournaments on purpose:
// nothing about club operations exists in this database).

export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "deuceandsmash-bazaar.firebaseapp.com",
  databaseURL: "https://deuceandsmash-bazaar-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "deuceandsmash-bazaar",
  storageBucket: "deuceandsmash-bazaar.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

// Display-side allowlist. The real lock is the database rules (bazaar/firebase-rules.json).
export const OWNERS = ['84.ranjith@gmail.com', 'rashmi.rajamanickam@gmail.com', 'manojnr.07@gmail.com'];

export const WHATSAPP = '919028337970';
export const SITE = 'https://deuceandsmash.com/bazaar/';
export const SOLD_BADGE_DAYS = 14;

export const LEVELS = ['Beginner', 'Beginner+', 'Intermediate', 'Intermediate+', 'Advanced'];

export const GRADES = {
  like_new:  { label: 'Like New',  color: '#7DC515', text: 'Under a month of use. No visible marks.' },
  excellent: { label: 'Excellent', color: '#1A6FD4', text: 'Light cosmetic scuffs only. Face texture intact.' },
  good:      { label: 'Good',      color: '#F5D628', text: 'Visible wear and edge-guard scuffs. Face texture partly worn. No cracks.' },
  fair:      { label: 'Fair',      color: '#E05A00', text: 'Heavy cosmetic wear or a repaired chip. Structurally sound, priced to move.' }
};

export const CATEGORY_TYPES = {
  racket:    'Racket / paddle',
  balls:     'Balls',
  apparel:   'Apparel / shoes (sizes)',
  accessory: 'Accessory'
};

export const STARTER_CATEGORIES = [
  { name: 'Padel rackets',       sport: 'padel',      type: 'racket' },
  { name: 'Pickleball paddles',  sport: 'pickleball', type: 'racket' },
  { name: 'Padel balls',         sport: 'padel',      type: 'balls' },
  { name: 'Pickleball balls',    sport: 'pickleball', type: 'balls' },
  { name: 'Apparel',             sport: 'both',       type: 'apparel' },
  { name: 'Shoes',               sport: 'both',       type: 'apparel' },
  { name: 'Grips & overgrips',   sport: 'both',       type: 'accessory' },
  { name: 'Bags',                sport: 'both',       type: 'accessory' },
  { name: 'Accessories',         sport: 'both',       type: 'accessory' },
  { name: 'Club merch',          sport: 'both',       type: 'apparel' }
];

/* ── helpers used by both pages ── */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const inr = v => (v === null || v === undefined || v === '' || isNaN(v)) ? '' : '₹' + Math.round(Number(v)).toLocaleString('en-IN');
export const discount = (mrp, price) => (mrp > 0 && price > 0 && price < mrp) ? Math.round((1 - price / mrp) * 100) : 0;
export const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 70);
export const list = o => Array.isArray(o) ? o.filter(x => x != null) : (o && typeof o === 'object' ? Object.values(o) : []);

/** Total new stock for a product: number, or null if the product isn't sold new. */
export function newStock(p) {
  if (p.variants && Object.keys(p.variants).length) return list(p.variants).reduce((s, v) => s + (Number(v.stock) || 0), 0);
  if (p.stock === null || p.stock === undefined || p.stock === '') return null;
  return Number(p.stock) || 0;
}

export function stockLabel(n) {
  if (n === null) return null;
  if (n <= 0) return { text: 'Sold out', cls: 'out' };
  if (n <= 2) return { text: `Only ${n} left`, cls: 'low' };
  return { text: 'In stock', cls: 'in' };
}

/** Used unit is shown publicly while available, and for SOLD_BADGE_DAYS after it sells. */
export function usedShown(u, now = Date.now()) {
  if (u.visible === false) return false;
  if (u.status === 'sold') return u.soldAt && (now - u.soldAt) < SOLD_BADGE_DAYS * 864e5;
  return true;
}

export const productTitle = p => [p.brand, p.model].filter(Boolean).join(' ');
