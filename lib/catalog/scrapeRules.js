export const RATING_CHOICES = [
  { id: '3', label: '3 stars and above' },
  { id: '4', label: '4 stars and above' },
  { id: '4.5', label: '4.5 stars and above' },
];

export const CUSTOM_CONDITIONS = [
  { id: 'weight-max', label: 'Weight at most', unit: 'grams' },
  { id: 'weight-min', label: 'Weight at least', unit: 'grams' },
  { id: 'rating-min', label: 'Rating at least', unit: 'stars' },
  { id: 'price-max', label: 'Price at most', unit: 'INR' },
  { id: 'price-min', label: 'Price at least', unit: 'INR' },
];

export const EXTRA_RULES = [
  { id: 'inStockOnly', label: 'Only products that are in stock', help: 'Out-of-stock Amazon listings are left out.' },
  { id: 'skipSponsored', label: 'Skip sponsored listings', help: 'Paid search ads are left out. Normal results stay.' },
  { id: 'skipUnrated', label: 'Skip products with no star rating', help: 'A listing with no stars is left out.' },
  { id: 'makePacks', label: 'Create quantity packs for light products', help: 'Packs of 2, 3 and 4 are still limited by the weight bands above.' },
  { id: 'includeShades', label: 'Include color and shade variants', help: 'Each shade becomes its own product. Leave this off to keep one listing.' },
];

export const DEFAULT_RULES = {
  minRating: 0,
  inStockOnly: false,
  skipSponsored: false,
  skipUnrated: false,
  makePacks: false,
  includeShades: false,
  custom: { kind: '', amount: 0 },
};

function on(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function normalizeRules(input) {
  const source = input && typeof input === 'object' ? input : {};
  const rating = Number(source.minRating);
  const allowed = RATING_CHOICES.map((item) => Number(item.id));
  const kind = CUSTOM_CONDITIONS.some((item) => item.id === source.custom?.kind) ? source.custom.kind : '';
  const amount = Number(source.custom?.amount);
  return {
    minRating: allowed.includes(rating) ? rating : 0,
    inStockOnly: on(source.inStockOnly),
    skipSponsored: on(source.skipSponsored),
    skipUnrated: on(source.skipUnrated),
    makePacks: on(source.makePacks),
    includeShades: on(source.includeShades),
    custom: { kind, amount: kind && amount > 0 ? amount : 0 },
  };
}

export function customBlockReason(product, custom, allowUnknownWeight = false) {
  if (!custom?.kind || !(Number(custom.amount) > 0)) return '';
  const amount = Number(custom.amount);
  const weight = Number(product?.weight_grams);
  const rating = Number(product?.rating);
  const price = Number(product?.price_inr);
  if (custom.kind === 'weight-max' || custom.kind === 'weight-min') {
    if (!(weight > 0)) return allowUnknownWeight ? '' : 'Weight is not listed.';
    if (custom.kind === 'weight-max' && weight > amount) return `Weight is ${weight} g, over ${amount} g.`;
    if (custom.kind === 'weight-min' && weight < amount) return `Weight is ${weight} g, under ${amount} g.`;
  }
  if (custom.kind === 'rating-min') {
    if (!(rating > 0)) return 'No star rating.';
    if (rating < amount) return `Rating is ${rating}, under ${amount} stars.`;
  }
  if (custom.kind === 'price-max' && price > amount) return `Price is ${price} INR, over ${amount} INR.`;
  if (custom.kind === 'price-min' && !(price >= amount)) return `Price is ${price} INR, under ${amount} INR.`;
  return '';
}

export function outOfStock(product) {
  const text = String(product?.availability || '').toLowerCase();
  return /out of stock|unavailable/.test(text);
}
