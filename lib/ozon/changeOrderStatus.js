import { ozonPost } from '../../ozon-http.js';
import { ozonErrorMessage, sellerHeaders } from './sellerClient';
import { dbStatusFor } from '../orders/statusMap';

const ROOT = 'https://api-seller.ozon.ru';

async function callOzon(account, path, body) {
  const response = await ozonPost(`${ROOT}${path}`, body, sellerHeaders(account));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(ozonErrorMessage(data, response.status));
    error.status = response.status;
    throw error;
  }
  return data;
}

function moveFailure(data) {
  const rows = Array.isArray(data?.result) ? data.result : [];
  const failed = rows.find((row) => row && row.result === false);
  if (!failed) return '';
  const detail = failed.error;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.message || item?.code || item).filter(Boolean).join('; ');
  }
  return String(detail || 'Ozon did not change this order.');
}

function packagesFor(posting) {
  const products = (Array.isArray(posting.products) ? posting.products : [])
    .map((product) => ({
      product_id: Number(product.sku || product.product_id),
      quantity: Number(product.quantity || 1),
    }))
    .filter((product) => product.product_id > 0 && product.quantity > 0);
  if (!products.length) throw new Error('This order has no products that can be packed.');
  return [{ products }];
}

async function readLiveStatus(account, postingNumber, fallback) {
  try {
    const data = await callOzon(account, '/v3/posting/fbs/get', { posting_number: postingNumber });
    return data?.result?.status || data?.status || fallback;
  } catch {
    return fallback;
  }
}

const REASON_EN = {
  352: 'Out of stock',
  400: 'Only damaged stock left',
  401: 'Seller rejected the dispute',
  402: 'Other reason',
  665: 'Buyer did not collect the order',
  666: 'No delivery to this region',
  667: 'Order lost by the delivery service',
};

export async function listCancelReasons(account, postingNumber) {
  const attempts = [
    ['/v1/cancel-reason/list-by-posting', { posting_number: [postingNumber] }],
    ['/v2/posting/fbs/cancel-reason/list', {}],
    ['/v1/posting/fbs/cancel-reason', {}],
  ];
  for (const [path, body] of attempts) {
    try {
      const data = await callOzon(account, path, body);
      const list = data?.result || data?.reasons || data?.items || [];
      const reasons = (Array.isArray(list) ? list : []).map((row) => {
        const id = Number(row.id ?? row.reason_id ?? row.cancel_reason_id);
        const title = REASON_EN[id] || String(row.title || row.name || row.type || '').trim();
        return { id, title };
      }).filter((row) => row.id && row.title);
      if (reasons.length) return reasons;
    } catch {
      // Try the next reasons endpoint.
    }
  }
  return [
    { id: 352, title: 'Out of stock' },
    { id: 400, title: 'Only damaged stock left' },
    { id: 402, title: 'Other reason' },
  ];
}

export async function changePostingStatus(account, posting, target, cancel = {}) {
  const postingNumber = String(posting.posting_number || '').trim();
  if (target === 'awaiting_deliver') {
    await callOzon(account, '/v4/posting/fbs/ship', {
      posting_number: postingNumber,
      packages: packagesFor(posting),
    });
  } else if (target === 'delivering') {
    const data = await callOzon(account, '/v2/fbs/posting/delivering', { posting_number: [postingNumber] });
    const failure = moveFailure(data);
    if (failure) throw new Error(failure);
  } else if (target === 'delivered') {
    const data = await callOzon(account, '/v2/fbs/posting/delivered', { posting_number: [postingNumber] });
    const failure = moveFailure(data);
    if (failure) throw new Error(failure);
  } else if (target === 'cancelled') {
    const reasonId = Number(cancel.reasonId);
    if (!reasonId) throw new Error('Choose a cancellation reason.');
    const message = String(cancel.message || '').trim();
    const body = { posting_number: postingNumber, cancel_reason_id: reasonId };
    if (message) body.cancel_reason_message = message;
    const data = await callOzon(account, '/v2/posting/fbs/cancel', body);
    if (data?.result === false) throw new Error('Ozon did not cancel this order.');
  } else {
    throw new Error('That status cannot be set from here.');
  }

  const live = await readLiveStatus(account, postingNumber, target);
  return { ozonStatus: live, status: dbStatusFor(live, dbStatusFor(target)) };
}
