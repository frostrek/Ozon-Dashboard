export const OZON_STATUS_MAP = {
  awaiting_packaging: 'AWAITING_PACKAGING',
  awaiting_approve: 'AWAITING_PACKAGING',
  awaiting_deliver: 'AWAITING_DELIVERY',
  delivering: 'IN_TRANSIT',
  driver_pickup: 'IN_TRANSIT',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  not_accepted: 'CANCELLED',
  cancelled_from_split: 'CANCELLED',
  arbitration: 'ARBITRATION',
};

export const DB_STATUS_LABEL = {
  AWAITING_PACKAGING: 'Awaiting Packaging',
  AWAITING_DELIVERY: 'Awaiting Delivery',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  ARBITRATION: 'Arbitration',
};

const SELLER_DELIVERY = new Set(['aggregator', 'non_integrated', '3pl_tracking', 'hybrid', '']);

export function dbStatusFor(ozonStatus, fallback = '') {
  return OZON_STATUS_MAP[ozonStatus] || fallback || 'AWAITING_PACKAGING';
}

export function nextOzonStatuses(ozonStatus, integrationType) {
  const sellerDelivery = SELLER_DELIVERY.has(String(integrationType || ''));
  if (ozonStatus === 'awaiting_packaging' || ozonStatus === 'awaiting_approve') {
    return ['awaiting_deliver', 'cancelled'];
  }
  if (ozonStatus === 'awaiting_deliver') {
    return sellerDelivery ? ['delivering', 'cancelled'] : ['cancelled'];
  }
  if (ozonStatus === 'delivering' || ozonStatus === 'driver_pickup') {
    return sellerDelivery ? ['delivered', 'cancelled'] : [];
  }
  return [];
}
