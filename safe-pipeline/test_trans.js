import { translateProduct } from './m6-translate.js';
const p = { asin: 'DUMMY1', brand: 'Loreal', name: 'Hair Serum', ingredients: 'Argain oil', feature_bullets: ['Smooth hair'], net_quantity: '100ml' };
translateProduct(p).then(res => console.log(JSON.stringify(res, null, 2)));
