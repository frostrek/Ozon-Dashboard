export const PRODUCT_COUNTS = [10, 20, 50, 100];

export const WEIGHT_BANDS = [
  { id: 'upto100', label: 'Up to 100 g', help: 'Also creates packs of 2, 3 and 4.' },
  { id: 'upto200', label: '101 to 200 g', help: 'Also creates a pack of 2.' },
  { id: 'upto500', label: '201 to 500 g', help: 'Sold as one unit.' },
  { id: 'over500', label: 'Over 500 g', help: 'Sold as one unit.' },
  { id: 'unknown', label: 'Weight not listed on Amazon', help: 'Sold as one unit.' },
];

export const DEFAULT_BANDS = {
  upto100: false,
  upto200: false,
  upto500: false,
  over500: false,
  unknown: false,
};

export function normalizeBands(input) {
  if (!input || typeof input !== 'object') return { ...DEFAULT_BANDS };
  const bands = {};
  for (const band of WEIGHT_BANDS) {
    const value = input[band.id];
    bands[band.id] = value === true || value === 1 || value === '1' || value === 'true';
  }
  return bands;
}

export function bandsChosen(bands) {
  return WEIGHT_BANDS.some((band) => bands[band.id]);
}

export function weightBandFor(grams) {
  const weight = Number(grams);
  if (!(weight > 0)) return 'unknown';
  if (weight <= 100) return 'upto100';
  if (weight <= 200) return 'upto200';
  if (weight <= 500) return 'upto500';
  return 'over500';
}

export function bandAllows(grams, bands) {
  return Boolean(normalizeBands(bands)[weightBandFor(grams)]);
}
