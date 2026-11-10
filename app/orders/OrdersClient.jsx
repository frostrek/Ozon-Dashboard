'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import TypeSelect from '../components/TypeSelect';
import ListPager from '../components/ListPager';
import { FETCH_SIZE, UI_BATCH, useBatchScroll } from '../hooks/useBatchScroll';
import { replaceQuery } from '../lib/replaceQuery';

const STATUS_LABEL = {
  AWAITING_PACKAGING: 'Awaiting Packaging',
  AWAITING_DELIVERY:  'Awaiting Delivery',
  IN_TRANSIT:         'In Transit',
  DELIVERED:          'Delivered',
  CANCELLED:          'Cancelled',
  ARBITRATION:        'Arbitration',
};

const STATUS_COLOR = {
  AWAITING_PACKAGING: { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
  AWAITING_DELIVERY:  { bg: '#E8F5F4', color: '#0C5D58', border: '#B2E0DC' },
  IN_TRANSIT:         { bg: '#EDE9FE', color: '#5B21B6', border: '#DDD6FE' },
  DELIVERED:          { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0' },
  CANCELLED:          { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
  ARBITRATION:        { bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' },
};

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function productImage(product) {
  const image = product?.primary_image;
  if (Array.isArray(image)) return image.find(Boolean) || '';
  if (typeof image === 'string') return image;
  return '';
}

function waitingForPickup(order) {
  const ozonStatus = String(order?._parsed?.status || '').trim();
  if (ozonStatus) return ozonStatus === 'awaiting_deliver';
  return order?.status === 'AWAITING_DELIVERY';
}

function moneyFor(order, product) {
  const rows = order?.financial_data?.products || [];
  return rows.find((row) => row.product_id == product?.offer_id || row.product_id == product?.product_id || row.product_id == product?.sku)
    || rows[0]
    || {};
}

function amountOf(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : null;
  }
  if (typeof value === 'object') return amountOf(value.amount ?? value.value ?? value.price);
  return null;
}

function currencyOf(value, fallback = '') {
  if (!value || typeof value !== 'object') return fallback;
  return String(value.currency_code || value.currency || fallback || '').trim();
}

function formatMoney(value, fallbackCurrency = '') {
  const amount = amountOf(value);
  if (amount == null) return '—';
  const currency = currencyOf(value, fallbackCurrency);
  const shown = amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return currency ? `${shown} ${currency}` : shown;
}

const OZON_NEXT = {
  awaiting_packaging: ['awaiting_deliver', 'cancelled'],
  awaiting_approve: ['awaiting_deliver', 'cancelled'],
  awaiting_deliver: ['delivering', 'cancelled'],
  delivering: ['delivered', 'cancelled'],
  driver_pickup: ['delivered', 'cancelled'],
};

const TARGET_LABEL = {
  awaiting_deliver: 'Awaiting Delivery',
  delivering: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function sellerCanMove(order) {
  return String(order?._parsed?.tpl_integration_type || '') !== 'ozon';
}

function nextTargets(order) {
  const options = OZON_NEXT[order?._parsed?.status] || [];
  if (sellerCanMove(order)) return options;
  return options.filter((status) => status === 'awaiting_deliver' || status === 'cancelled');
}

function StatusBadge({ status }) {
  const cfg = STATUS_COLOR[status] || { bg: '#F1F5F9', color: '#475569' };
  return (
    <span className="orders-badge" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border || 'transparent'}` }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function Icon({ d, children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {d ? <path d={d} /> : children}
    </svg>
  );
}


function RealisticAllOrdersIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="orders-realistic-icon" aria-hidden="true">
      <defs>
        <linearGradient id="ordAllGrad" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2DD4BF" />
          <stop offset="50%" stopColor="#14B8A6" />
          <stop offset="100%" stopColor="#0F766E" />
        </linearGradient>
        <linearGradient id="ordAllBox" x1="14" y1="12" x2="34" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5EEAD4" />
          <stop offset="100%" stopColor="#0D9488" />
        </linearGradient>
        <filter id="ordAllGlow" x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0F766E" floodOpacity="0.25" />
        </filter>
      </defs>
      <g filter="url(#ordAllGlow)">
        <circle cx="16" cy="38" r="3.5" fill="#1E293B" />
        <circle cx="16" cy="38" r="1.5" fill="#94A3B8" />
        <circle cx="34" cy="38" r="3.5" fill="#1E293B" />
        <circle cx="34" cy="38" r="1.5" fill="#94A3B8" />
        <path d="M7 11H12L15 29C15.2 30.1 16.1 31 17.2 31H35C36.1 31 37 30.1 37.2 29L39.5 17H13.5" stroke="url(#ordAllGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="18" y="14" width="10" height="10" rx="1.5" fill="url(#ordAllBox)" />
        <path d="M18 19H28" stroke="#FFFFFF" strokeWidth="1" opacity="0.7" />
        <path d="M23 14V24" stroke="#FFFFFF" strokeWidth="1" opacity="0.7" />
        <rect x="26" y="9" width="11" height="11" rx="1.5" fill="#F59E0B" />
        <path d="M26 14.5H37" stroke="#FEF3C7" strokeWidth="1" opacity="0.8" />
        <path d="M31.5 9V20" stroke="#FEF3C7" strokeWidth="1" opacity="0.8" />
      </g>
    </svg>
  );
}

function RealisticPackagingIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="orders-realistic-icon" aria-hidden="true">
      <defs>
        <linearGradient id="ordPackTop" x1="10" y1="10" x2="38" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="ordPackL" x1="10" y1="18" x2="24" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D97706" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <linearGradient id="ordPackR" x1="24" y1="18" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#B45309" />
          <stop offset="100%" stopColor="#78350F" />
        </linearGradient>
        <filter id="ordPackGlow" x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#B45309" floodOpacity="0.25" />
        </filter>
      </defs>
      <g filter="url(#ordPackGlow)">
        <path d="M10 18L24 10L38 18L24 26L10 18Z" fill="url(#ordPackTop)" />
        <path d="M10 18L24 26V40L10 32V18Z" fill="url(#ordPackL)" />
        <path d="M24 26L38 18V32L24 40V26Z" fill="url(#ordPackR)" />
        <path d="M21 11.7L27 15.2V27.7L21 24.2V11.7Z" fill="#FEF3C7" opacity="0.95" />
        <path d="M24 26V40" stroke="#FDE68A" strokeWidth="1.2" opacity="0.8" />
        <polygon points="13,24 19,27 19,33 13,30" fill="#FFFFFF" opacity="0.95" />
        <line x1="14.5" y1="26.5" x2="17.5" y2="28" stroke="#92400E" strokeWidth="1" strokeLinecap="round" />
        <line x1="14.5" y1="28.5" x2="17.5" y2="30" stroke="#92400E" strokeWidth="1" strokeLinecap="round" />
        <path d="M10 18L24 26L38 18" stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />
      </g>
    </svg>
  );
}

function RealisticDeliveryIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="orders-realistic-icon" aria-hidden="true">
      <defs>
        <linearGradient id="ordVanBody" x1="6" y1="14" x2="29" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#189890" />
          <stop offset="100%" stopColor="#10756F" />
        </linearGradient>
        <linearGradient id="ordVanCabin" x1="29" y1="17" x2="42" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2DD4BF" />
          <stop offset="100%" stopColor="#0F766E" />
        </linearGradient>
        <filter id="ordVanGlow" x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0F766E" floodOpacity="0.25" />
        </filter>
      </defs>
      <g filter="url(#ordVanGlow)">
        <rect x="6" y="14" width="23" height="18" rx="2.5" fill="url(#ordVanBody)" />
        <path d="M6 22H29V24.5H6V22Z" fill="#CCFBF1" opacity="0.45" />
        <path d="M29 17H35C36.3 17 37.5 17.8 38.1 19L41.3 24.5C41.8 25.3 42 26.1 42 27V30C42 31.1 41.1 32 40 32H29V17Z" fill="url(#ordVanCabin)" />
        <path d="M30.5 19H34.8C35.5 19 36.1 19.4 36.5 20L39 24.5C39.2 24.8 39.3 25.1 39.3 25.5H30.5V19Z" fill="#E0F2FE" />
        <rect x="40.5" y="27" width="2" height="3" rx="1" fill="#FBBF24" />
        <rect x="40" y="30.5" width="2.5" height="1.8" rx="0.5" fill="#334155" />
        <circle cx="13" cy="32" r="5" fill="#1E293B" />
        <circle cx="13" cy="32" r="2.5" fill="#94A3B8" />
        <circle cx="13" cy="32" r="1.2" fill="#F8FAFC" />
        <circle cx="35" cy="32" r="5" fill="#1E293B" />
        <circle cx="35" cy="32" r="2.5" fill="#94A3B8" />
        <circle cx="35" cy="32" r="1.2" fill="#F8FAFC" />
      </g>
    </svg>
  );
}

function RealisticTransitIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="orders-realistic-icon" aria-hidden="true">
      <defs>
        <linearGradient id="ordTransitGrad" x1="12" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id="ordParcelGrad" x1="16" y1="19" x2="32" y2="33" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C4B5FD" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>
        <filter id="ordTransitGlow" x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#7C3AED" floodOpacity="0.25" />
        </filter>
      </defs>
      <g filter="url(#ordTransitGlow)">
        <circle cx="24" cy="24" r="17" stroke="#EDE9FE" strokeWidth="2.5" strokeDasharray="3 3" opacity="0.8" />
        <path d="M11 24C11 16.82 16.82 11 24 11C28.5 11 32.5 13.3 34.8 17" stroke="url(#ordTransitGrad)" strokeWidth="3" strokeLinecap="round" />
        <rect x="16" y="19" width="16" height="13" rx="2.5" fill="url(#ordParcelGrad)" />
        <path d="M16 23.5H32" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.8" />
        <path d="M24 19V32" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.8" />
        <path d="M7 23H13" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M9 28H14" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round" />
        <polygon points="27,12 35,15 31,21" fill="#7C3AED" />
      </g>
    </svg>
  );
}

function RealisticDeliveredIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="orders-realistic-icon" aria-hidden="true">
      <defs>
        <linearGradient id="ordDelivGrad" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <linearGradient id="ordDelivRim" x1="12" y1="8" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A7F3D0" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <filter id="ordDelivGlow" x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#059669" floodOpacity="0.25" />
        </filter>
      </defs>
      <g filter="url(#ordDelivGlow)">
        <circle cx="24" cy="24" r="17.5" fill="url(#ordDelivGrad)" />
        <circle cx="24" cy="24" r="14.5" stroke="url(#ordDelivRim)" strokeWidth="1.5" fill="none" opacity="0.75" />
        <path d="M12 20C13.5 14 18 10 24 10C29 10 33 13 35 17C32 14.5 28 13.5 24 13.5C19 13.5 14.5 16 12 20Z" fill="#FFFFFF" opacity="0.35" />
        <path d="M16 24.5L21.5 30L32 19" stroke="#064E3B" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 23.5L21.5 29L32 18" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

function RealisticCancelledIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" className="orders-realistic-icon" aria-hidden="true">
      <defs>
        <linearGradient id="ordCancGrad" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F87171" />
          <stop offset="100%" stopColor="#DC2626" />
        </linearGradient>
        <linearGradient id="ordCancRim" x1="12" y1="8" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FECACA" />
          <stop offset="100%" stopColor="#991B1B" />
        </linearGradient>
        <filter id="ordCancGlow" x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#DC2626" floodOpacity="0.25" />
        </filter>
      </defs>
      <g filter="url(#ordCancGlow)">
        <circle cx="24" cy="24" r="17.5" fill="url(#ordCancGrad)" />
        <circle cx="24" cy="24" r="14.5" stroke="url(#ordCancRim)" strokeWidth="1.5" fill="none" opacity="0.75" />
        <path d="M12 20C13.5 14 18 10 24 10C29 10 33 13 35 17C32 14.5 28 13.5 24 13.5C19 13.5 14.5 16 12 20Z" fill="#FFFFFF" opacity="0.35" />
        <path d="M18.5 18.5L29.5 29.5M29.5 18.5L18.5 29.5" stroke="#7F1D1D" strokeWidth="4.2" strokeLinecap="round" />
        <path d="M18.5 17.5L29.5 28.5M29.5 17.5L18.5 28.5" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function TabIcon({ name }) {
  if (name === 'ALL') return <RealisticAllOrdersIcon />;
  if (name === 'AWAITING_PACKAGING') return <RealisticPackagingIcon />;
  if (name === 'AWAITING_DELIVERY') return <RealisticDeliveryIcon />;
  if (name === 'IN_TRANSIT') return <RealisticTransitIcon />;
  if (name === 'DELIVERED') return <RealisticDeliveredIcon />;
  return <RealisticCancelledIcon />;
}


function OrderDrawer({ order, onClose }) {
  if (!order) return null;
  const d = order._parsed;

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', zIndex:99 }} />
      {/* Panel */}
      <div style={{
        position:'fixed', top:0, right:0, width:'480px', height:'100vh',
        background:'#fff', zIndex:100, overflowY:'auto',
        boxShadow:'-4px 0 24px rgba(0,0,0,0.12)', display:'flex', flexDirection:'column'
      }}>
        {/* Header */}
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #CCECE8', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <p style={{ fontSize:'11px', color:'#5A7572', marginBottom:'4px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em' }}>Posting Number</p>
            <p style={{ fontSize:'16px', fontWeight:750, color:'#0C5D58', fontFamily:'monospace' }}>{order.posting_number}</p>
          </div>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <StatusBadge status={order.status} />
            <button onClick={onClose} style={{ background:'#E8F5F4', color:'#0C5D58', border:'1px solid #B2E0DC', borderRadius:'8px', padding:'6px 12px', fontSize:'13px', fontWeight:650, cursor:'pointer' }}>✕ Close</button>
          </div>
        </div>

        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:'20px' }}>
          {/* Dates */}
          <Section title="Timeline">
            <Row label="Accepted"         value={fmt(d.in_process_at)} />
            <Row label="Ship By"          value={fmt(d.shipment_date)} />
            <Row label="Delivery Window"  value={d.analytics_data?.delivery_date_begin ? `${fmtDate(d.analytics_data.delivery_date_begin)} – ${fmtDate(d.analytics_data.delivery_date_end)}` : '—'} />
          </Section>

          {/* Products */}
          <Section title="Products">
            {(d.products || []).length === 0 ? <p style={{ fontSize:'12px', color:'#64748B' }}>No product on this order.</p> : null}
            {(d.products || []).map((p, i) => {
              const image = productImage(p);
              const price = moneyFor(d, p);
              return (
              <div key={i} style={{ display:'flex', gap:'12px', padding:'12px 0', borderBottom:'1px solid #F1F5F9' }}>
                {image ? (
                  <img src={image} alt={p.offer_id || ''} loading="lazy" decoding="async" width={64} height={64} style={{ width:64, height:64, objectFit:'cover', borderRadius:8, flexShrink:0, border:'1px solid #E2E8F0' }} />
                ) : (
                  <div style={{ width:64, height:64, background:'#F1F5F9', borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#94A3B8', fontSize:'10px' }}>No img</div>
                )}
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:'12px', color:'#1E293B', marginBottom:'4px', lineHeight:1.4 }}>{p.name || '—'}</p>
                  {p._russian_name && <p style={{ fontSize:'11px', color:'#94A3B8', marginBottom:'6px', fontStyle:'italic' }}>Original: {p._russian_name}</p>}
                  <p style={{ fontSize:'11px', color:'#64748B', marginBottom:'2px' }}>SKU: <strong>{p.offer_id || '—'}</strong></p>
                  <p style={{ fontSize:'11px', color:'#64748B' }}>Qty: {p.quantity ?? '—'} &nbsp;|&nbsp; {price.price ? `${price.currency_code || ''} ${price.price}` : '—'} </p>
                </div>
              </div>
              );
            })}
          </Section>

          {/* Delivery */}
          <Section title="Delivery">
            <Row label="Method"    value={d.delivery_method?.name} />
            <Row label="Warehouse" value={d.delivery_method?.warehouse} />
            <Row label="Provider"  value={d.delivery_method?.tpl_provider} />
            <Row label="City"      value={d.analytics_data?.city} />
            <Row label="Type"      value={d.analytics_data?.delivery_type} />
          </Section>

          {/* Customer */}
          <Section title="Customer">
            <Row label="Name"    value={d.customer?.name} />
            <Row label="City"    value={d.customer?.address?.city} />
            <Row label="Country" value={d.customer?.address?.country} />
          </Section>

          {/* Account */}
          <Section title="Account">
            <Row label="Seller Account" value={order._accountName} />
            <Row label="Account"        value={order.account_id} />
          </Section>

          {/* Financial */}
          {d.financial_data?.products?.[0] && (
            <Section title="Financials">
              <Row label="Customer Paid" value={formatMoney(d.financial_data.products[0].customer_price)} />
              <Row label="List Price"    value={formatMoney(d.financial_data.products[0].old_price, 'USD')} />
              <Row label="Sale Price"    value={formatMoney(d.financial_data.products[0].price, 'USD')} />
              <Row label="Discount"      value={`${d.financial_data.products[0].total_discount_percent?.toFixed(1)}%`} />
            </Section>
          )}

          {/* Status History */}
          {order._history?.length > 0 && (
            <Section title="Status History">
              {order._history.map((h, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #F8FAFC' }}>
                  <StatusBadge status={h.status} />
                  <span style={{ fontSize:'12px', color:'#64748B' }}>{fmt(h.changed_at)}</span>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p style={{ fontSize:'11px', fontWeight:700, color:'#0C5D58', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'10px' }}>{title}</p>
      <div style={{ background:'#F4FAF9', border:'1px solid #CCECE8', borderRadius:'12px', padding:'12px 14px' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #E8F2F0', fontSize:'13px' }}>
      <span style={{ color:'#5A7572', fontWeight:500 }}>{label}</span>
      <span style={{ color:'#0F172A', fontWeight:600, textAlign:'right', maxWidth:'260px' }}>{value || '—'}</span>
    </div>
  );
}

export default function OrdersClient({ orders, statusCounts, accounts, currentStatus, currentAccount, currentDate, currentFrom = '', currentTo = '', currentFromTime = '', currentToTime = '', currentSearch, filteredCount = 0 }) {
  const router = useRouter();
  const [selected, setSelected] = useState(null);
  const [statusOverrides, setStatusOverrides] = useState({});
  const [statusChange, setStatusChange] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [statusFilter, setStatusFilter] = useState(currentStatus || 'ALL');
  const [accountFilter, setAccountFilter] = useState(currentAccount || 'all');
  const [dateFilter, setDateFilter] = useState(currentDate || 'all');
  const [fromDate, setFromDate] = useState(currentFrom || '');
  const [toDate, setToDate] = useState(currentTo || '');
  const [fromTime, setFromTime] = useState(currentFromTime || '');
  const [toTime, setToTime] = useState(currentToTime || '');
  const [tempFromDate, setTempFromDate] = useState(currentFrom || '');
  const [tempToDate, setTempToDate] = useState(currentTo || '');
  const [tempFromTime, setTempFromTime] = useState(currentFromTime || '');
  const [tempToTime, setTempToTime] = useState(currentToTime || '');
  const [showCustomDate, setShowCustomDate] = useState(false);
  const customDateRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (customDateRef.current && !customDateRef.current.contains(e.target)) {
        setShowCustomDate(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [searchFilter, setSearchFilter] = useState(currentSearch || '');
  const [counts, setCounts] = useState(statusCounts || {});
  const [refreshing, setRefreshing] = useState(false);
  const [copiedPosting, setCopiedPosting] = useState('');
  const [printingRowId, setPrintingRowId] = useState('');
  const [movingRowId, setMovingRowId] = useState('');

  // Suggestion 1: One-Click Thermal Label Print (New Tab)
  async function printSingleOrderLabel(orderId) {
    if (printingRowId) return;
    setPrintingRowId(orderId);
    try {
      const res = await fetch('/api/orders/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [orderId], format: 'thermal' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate thermal label');
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (err) {
      alert('Could not print thermal label: ' + err.message);
    } finally {
      setPrintingRowId('');
    }
  }

  // Suggestion 3: Single-Click Quick Status Movement with confirmation safeguard
  async function quickMoveStatus(order, targetStatus) {
    if (movingRowId) return;
    const actionLabel = targetStatus === 'awaiting_deliver' ? 'Pack' : 'Ship';
    const confirmMessage = targetStatus === 'awaiting_deliver'
      ? `Pack order "${order.posting_number}"?\n\nThis will mark the order as Packed and move it to "Awaiting Delivery" on Ozon so you can print the thermal shipping label.`
      : `Ship order "${order.posting_number}"?\n\nThis will mark the order as In Transit on Ozon.`;

    if (!window.confirm(confirmMessage)) return;

    setMovingRowId(order.id);
    try {
      const res = await fetch('/api/orders/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [order.id], status: targetStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data.failed && data.failed.length > 0)) {
        throw new Error(data.failed?.[0]?.error || data.error || 'Status update failed');
      }
      setStatusNote(`✓ Updated order ${order.posting_number} to ${TARGET_LABEL[targetStatus] || targetStatus}`);
      router.refresh();
    } catch (err) {
      alert('Status update error: ' + err.message);
    } finally {
      setMovingRowId('');
    }
  }

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      setStatusOverrides({});
      router.refresh();
      await scroll.refresh();
    } catch (err) {
      console.error('[Orders] Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }
  const scroll = useBatchScroll({
    initialItems: orders,
    initialTotal: filteredCount,
    resetKey: `${statusFilter}|${accountFilter}|${dateFilter}|${fromDate}|${toDate}|${fromTime}|${toTime}|${searchFilter}`,
    pageMode: true,
    loadPage: async (page) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(FETCH_SIZE),
        status: statusFilter || 'ALL',
        account: accountFilter || 'all',
        date: dateFilter || 'all',
        from: dateFilter === 'custom' ? (fromDate || '') : '',
        to: dateFilter === 'custom' ? (toDate || '') : '',
        fromTime: dateFilter === 'custom' ? (fromTime || '') : '',
        toTime: dateFilter === 'custom' ? (toTime || '') : '',
        q: searchFilter || '',
      });
      const response = await fetch(`/api/orders?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Orders could not be loaded.');
      if (data.statusCounts) setCounts(data.statusCounts);
      return { items: data.orders || [], total: Number(data.filteredCount) || 0 };
    },
  });

  function applyFilters(patch) {
    if (patch.status != null) setStatusFilter(patch.status);
    if (patch.account != null) setAccountFilter(patch.account);
    if (patch.date != null) {
      setDateFilter(patch.date);
      if (patch.date !== 'custom') {
        setFromDate('');
        setToDate('');
        setFromTime('');
        setToTime('');
      }
    }
    if (patch.from !== undefined) setFromDate(patch.from);
    if (patch.to !== undefined) setToDate(patch.to);
    if (patch.fromTime !== undefined) setFromTime(patch.fromTime);
    if (patch.toTime !== undefined) setToTime(patch.toTime);
    if (patch.q != null) setSearchFilter(patch.q);
  }

  function clearFilters() {
    setStatusFilter('ALL');
    setAccountFilter('all');
    setDateFilter('all');
    setFromDate('');
    setToDate('');
    setFromTime('');
    setToTime('');
    setSearchFilter('');
    setQuery('');
  }

  const STATUS_TABS = [
    { key: 'ALL',                label: 'All Orders'         },
    { key: 'AWAITING_PACKAGING', label: 'Awaiting Packaging' },
    { key: 'AWAITING_DELIVERY',  label: 'Awaiting Delivery'  },
    { key: 'IN_TRANSIT',         label: 'In Transit'         },
    { key: 'DELIVERED',          label: 'Delivered'          },
    { key: 'CANCELLED',          label: 'Cancelled'          },
  ];

  const DATE_FILTERS = [
    { key: 'all',       label: 'All Time' },
    { key: 'today',     label: 'Today'    },
    { key: 'yesterday', label: 'Yesterday'},
  ];

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [excelBusy, setExcelBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [docBusy, setDocBusy] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState(currentSearch || '');
  const [menuId, setMenuId] = useState(null);

  useEffect(() => {
    setSearching(false);
    setSelectedIds(new Set());
    setMenuId(null);
    replaceQuery('/orders', {
      status: statusFilter === 'ALL' ? '' : statusFilter,
      account: accountFilter === 'all' ? '' : accountFilter,
      date: dateFilter === 'all' ? '' : dateFilter,
      from: dateFilter === 'custom' ? fromDate : '',
      to: dateFilter === 'custom' ? toDate : '',
      fromTime: dateFilter === 'custom' ? fromTime : '',
      toTime: dateFilter === 'custom' ? toTime : '',
      q: searchFilter,
    });
  }, [searchFilter, statusFilter, accountFilter, dateFilter, fromDate, toDate, fromTime, toTime]);
  
  const toggleAll = () => {
      const pageIds = visibleOrders.map((order) => order.id);
      if (pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))) setSelectedIds(new Set());
      else setSelectedIds(new Set(pageIds));
  };

  const toggleOne = (id) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelectedIds(next);
  };

  const calculateAge = (dateStr) => {
      if (!dateStr) return 0;
      const days = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
      return Math.max(0, days);
  };

  async function exportSelectedExcel() {
      const subsetIds = selectedIds.size ? [...selectedIds] : scroll.loaded.map((order) => order.id);
      if (subsetIds.length === 0 || excelBusy) return;
      setPdfError('');
      setExcelBusy(true);
      try {
        const response = await fetch('/api/orders/excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: subsetIds }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setPdfError(data.error || 'The Excel file could not be built.');
          return;
        }
        const blob = await response.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'orders.xlsx';
        link.click();
        URL.revokeObjectURL(link.href);
      } catch {
        setPdfError('The Excel file could not be built.');
      } finally {
        setExcelBusy(false);
      }
  }

  async function downloadOzonDocument(kind) {
    const chosen = visibleOrders.filter((order) => selectedIds.has(order.id) && (kind !== 'shipping' || waitingForPickup(order)));
    if (chosen.length === 0 || docBusy) return;
    setPdfError('');
    setDocBusy(kind);
    try {
      const response = await fetch('/api/labels/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, orderIds: chosen.map((order) => order.id) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setPdfError(data.error || 'Ozon did not return the document.');
        return;
      }
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = kind === 'shipping' ? 'ozon-shipping-labels.pdf' : 'ozon-product-list.pdf';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setPdfError('Ozon did not return the document.');
    } finally {
      setDocBusy('');
    }
  }

  async function exportSelectedPdf() {
    if (selectedIds.size === 0) return;
    setPdfError('');
    setPdfBusy(true);
    try {
      const response = await fetch('/api/orders/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds], format: 'thermal' }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setPdfError(data.error || 'The thermal label PDF could not be created.');
        return;
      }
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'thermal-labels.pdf';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setPdfError('The PDF could not be created.');
    } finally {
      setPdfBusy(false);
    }
  }

  const visibleOrders = scroll.items.map((order) => statusOverrides[order.id] || order);

  function openStatusChange(ids, target) {
    const chosen = visibleOrders.filter((order) => ids.includes(order.id) && nextTargets(order).includes(target));
    if (!chosen.length) {
      setStatusNote('None of the selected orders can move to that status on Ozon.');
      return;
    }
    setStatusNote('');
    setStatusChange({
      ids: chosen.map((order) => order.id),
      target,
      reasons: [],
      reasonId: '',
      message: '',
      error: '',
    });
    if (target === 'cancelled') {
      fetch('/api/orders/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reasons', ids: [chosen[0].id] }),
      })
        .then((response) => response.json())
        .then((data) => {
          const reasons = Array.isArray(data.reasons) ? data.reasons : [];
          setStatusChange((current) => current && current.target === 'cancelled'
            ? { ...current, reasons, reasonId: reasons[0] ? String(reasons[0].id) : '', error: data.error || '' }
            : current);
        })
        .catch(() => {
          setStatusChange((current) => current ? { ...current, error: 'Cancellation reasons could not be loaded.' } : current);
        });
    }
  }

  async function confirmStatusChange() {
    if (!statusChange || statusBusy) return;
    if (statusChange.target === 'cancelled' && !statusChange.reasonId) {
      setStatusChange({ ...statusChange, error: 'Choose a cancellation reason.' });
      return;
    }
    setStatusBusy(true);
    try {
      const response = await fetch('/api/orders/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: statusChange.ids,
          status: statusChange.target,
          cancelReasonId: Number(statusChange.reasonId) || undefined,
          cancelReasonMessage: statusChange.message,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusChange({ ...statusChange, error: data.error || 'Ozon did not change the status.' });
        return;
      }
      const byId = new Map(visibleOrders.map((order) => [order.id, order]));
      setStatusOverrides((current) => {
        const next = { ...current };
        for (const row of data.updated || []) {
          const order = byId.get(row.id);
          if (!order) continue;
          next[row.id] = { ...order, status: row.status, _parsed: { ...order._parsed, status: row.ozonStatus } };
        }
        return next;
      });
      const firstFailure = data.failed?.[0];
      if (firstFailure) {
        const extra = data.failed.length > 1 ? ` ${data.failed.length} orders were not changed.` : '';
        setStatusChange({ ...statusChange, error: `${firstFailure.postingNumber}: ${firstFailure.error}${extra}` });
        router.refresh();
        return;
      }
      const updatedCount = Array.isArray(data.updated) ? data.updated.length : 0;
      setStatusNote(updatedCount ? `Ozon updated ${updatedCount} order${updatedCount === 1 ? '' : 's'}.` : '');
      setStatusChange(null);
      setSelected(null);
      router.refresh();
    } catch {
      setStatusChange({ ...statusChange, error: 'Ozon did not change the status.' });
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <div className="orders-page">
      <header className="orders-hero">
        <div>
          <h1>Orders</h1>
        </div>
        <div className="orders-art">
          <img src="/orders-hero.png" alt="" />
        </div>
      </header>
      <div className="orders-tabs">
        {STATUS_TABS.map(tab => {
          const active = (statusFilter || 'ALL') === tab.key;
          const count = tab.key === 'ALL' ? counts._total : (counts[tab.key] || 0);
          return (
            <button key={tab.key} type="button" onClick={() => applyFilters({ status: tab.key })} className={`orders-tab${active ? ' is-on' : ''}${tab.key === 'DELIVERED' ? ' is-delivered' : ''}${tab.key === 'CANCELLED' ? ' is-cancelled' : ''}`}>
              <TabIcon name={tab.key} />
              <span className="orders-tab-copy">
                <span>{tab.label}</span>
                {active ? null : <strong>{Number(count).toLocaleString('en-US')}</strong>}
              </span>
              {active ? <em>{Number(count).toLocaleString('en-US')}</em> : null}
            </button>
          );
        })}
      </div>

      <div className="orders-filters">
        <div className="orders-dates">
          {DATE_FILTERS.map(df => {
            const on = (dateFilter || 'all') === df.key;
            return (
              <button key={df.key} type="button" onClick={() => applyFilters({ date: df.key })} className={on ? 'is-on' : ''}>
                {on ? <Icon><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></Icon> : null}
                {df.label}
              </button>
            );
          })}

          <div className="orders-custom-date-wrap" ref={customDateRef}>
            <button
              type="button"
              onClick={() => {
                setTempFromDate(fromDate);
                setTempToDate(toDate);
                setTempFromTime(fromTime);
                setTempToTime(toTime);
                setShowCustomDate(!showCustomDate);
              }}
              className={`orders-custom-date-btn${dateFilter === 'custom' ? ' is-on' : ''}`}
              aria-label="Custom date and time range"
              title="Custom date and time range"
            >
              <Icon><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></Icon>
              <span>
                {dateFilter === 'custom' && (fromDate || toDate)
                  ? `${fromDate || '...'}${fromTime ? ' ' + fromTime : ''} — ${toDate || '...'}${toTime ? ' ' + toTime : ''}`
                  : 'Custom'}
              </span>
              <Icon><path d="m6 9 6 6 6-6" /></Icon>
            </button>

            {showCustomDate ? (
              <div className="orders-custom-popover">
                <div className="orders-custom-popover-header">
                  <strong>Date & Time Range</strong>
                  <button
                    type="button"
                    className="orders-custom-close-btn"
                    onClick={() => setShowCustomDate(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>

                <div className="orders-custom-popover-grid">
                  <div className="orders-custom-group">
                    <label className="orders-custom-label">From Date</label>
                    <input
                      type="date"
                      className="orders-custom-input"
                      value={tempFromDate}
                      onChange={(e) => setTempFromDate(e.target.value)}
                    />
                  </div>
                  <div className="orders-custom-group">
                    <label className="orders-custom-label">From Time</label>
                    <input
                      type="time"
                      className="orders-custom-input"
                      value={tempFromTime}
                      onChange={(e) => setTempFromTime(e.target.value)}
                    />
                  </div>
                  <div className="orders-custom-group">
                    <label className="orders-custom-label">To Date</label>
                    <input
                      type="date"
                      className="orders-custom-input"
                      value={tempToDate}
                      onChange={(e) => setTempToDate(e.target.value)}
                    />
                  </div>
                  <div className="orders-custom-group">
                    <label className="orders-custom-label">To Time</label>
                    <input
                      type="time"
                      className="orders-custom-input"
                      value={tempToTime}
                      onChange={(e) => setTempToTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="orders-custom-popover-actions">
                  <button
                    type="button"
                    className="dash-outline orders-custom-clear-btn"
                    onClick={() => {
                      setTempFromDate('');
                      setTempToDate('');
                      setTempFromTime('');
                      setTempToTime('');
                      applyFilters({ date: 'all', from: '', to: '', fromTime: '', toTime: '' });
                      setShowCustomDate(false);
                    }}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="dash-primary orders-custom-apply-btn"
                    disabled={!tempFromDate && !tempToDate}
                    onClick={() => {
                      applyFilters({
                        date: 'custom',
                        from: tempFromDate,
                        to: tempToDate,
                        fromTime: tempFromTime,
                        toTime: tempToTime,
                      });
                      setShowCustomDate(false);
                    }}
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="orders-filters-right">
          <label className="orders-account">
            <Icon><path d="M12 3 4 7l8 4 8-4-8-4Z" /><path d="m4 12 8 4 8-4" /><path d="m4 17 8 4 8-4" /></Icon>
            <TypeSelect
              label="Account"
              value={accountFilter || 'all'}
              options={[{ id: 'all', label: 'All Accounts' }, ...accounts.map((account) => ({ id: account.id, label: account.name }))]}
              onChange={(next) => applyFilters({ account: next })}
            />
          </label>

          <form className="orders-search" onSubmit={(event) => { event.preventDefault(); setSearching(true); applyFilters({ q: query.trim() }); }}>
            <span className="orders-search-field">
              <Icon><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></Icon>
              <input name="q" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." aria-label="Search orders" />
              {query ? (
                <button type="button" className="orders-clear" aria-label="Clear search" onClick={() => { setQuery(''); applyFilters({ q: '' }); }}>×</button>
              ) : null}
            </span>
            <button type="submit" className={`dash-primary orders-search-btn${searching ? ' is-busy' : ''}`} disabled={searching} aria-label="Search" title="Search">
              <Icon><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></Icon>
            </button>
          </form>
          <button type="button" className="dash-outline" onClick={exportSelectedExcel} disabled={excelBusy || (selectedIds.size === 0 && scroll.loaded.length === 0)}>
            <Icon><path d="M12 4v10" /><path d="m8 10 4 4 4-4" /><path d="M5 19h14" /></Icon>
            {excelBusy ? 'Building Excel...' : 'Export Excel'}
          </button>
        </div>
      </div>

      <div className="orders-meta">
        <p>
          <strong className="orders-count">{`${scroll.total.toLocaleString('en-US')} ${scroll.total === 1 ? 'order' : 'orders'}`}</strong>
          {statusFilter && statusFilter !== 'ALL' ? <button type="button" className="orders-chip" onClick={() => applyFilters({ status: 'ALL' })}>Status: {STATUS_LABEL[statusFilter] || statusFilter} ×</button> : null}
          {dateFilter && dateFilter !== 'all' ? (
            <button type="button" className="orders-chip" onClick={() => applyFilters({ date: 'all' })}>
              Date: {dateFilter === 'custom'
                ? `${fromDate || 'Start'}${fromTime ? ' ' + fromTime : ''} → ${toDate || 'End'}${toTime ? ' ' + toTime : ''}`
                : DATE_FILTERS.find((item) => item.key === dateFilter)?.label || dateFilter} ×
            </button>
          ) : null}
          {accountFilter && accountFilter !== 'all' ? <button type="button" className="orders-chip" onClick={() => applyFilters({ account: 'all' })}>Account: {accounts.find((account) => account.id === accountFilter)?.name || 'Account'} ×</button> : null}
          {searchFilter ? <button type="button" className="orders-chip" onClick={() => { setQuery(''); applyFilters({ q: '' }); }}>Search: {searchFilter} ×</button> : null}
          {pdfError ? <span className="orders-note is-bad" role="alert">{pdfError}</span> : null}
          {statusNote ? <span className="orders-note is-ok" role="status">{statusNote}</span> : null}
        </p>
        <div className="orders-bulk">
          <span className="orders-selected">
            {selectedIds.size} selected
          </span>
          <select defaultValue="" aria-label="Change selected orders on Ozon" disabled={statusBusy || selectedIds.size === 0} onChange={(event) => { const value = event.target.value; event.target.value = ''; openStatusChange([...selectedIds], value); }}>
            <option value="">{statusBusy ? 'Updating...' : 'Change on Ozon'}</option>
            {['awaiting_deliver', 'delivering', 'delivered', 'cancelled'].map((status) => (
              <option key={status} value={status}>{TARGET_LABEL[status]}</option>
            ))}
          </select>
          <button type="button" className="dash-outline" onClick={exportSelectedPdf} disabled={selectedIds.size === 0 || pdfBusy || Boolean(docBusy)}>{pdfBusy ? 'Building Labels...' : 'Thermal Labels (PDF)'}</button>
          <button type="button" className="dash-outline" onClick={() => downloadOzonDocument('product')} disabled={selectedIds.size === 0 || Boolean(docBusy)}>{docBusy === 'product' ? 'Downloading...' : 'Ozon product list'}</button>
          <button type="button" className={`dash-outline orders-refresh${refreshing ? ' is-busy' : ''}`} onClick={handleRefresh} disabled={refreshing}>
            <Icon><path d="M20 12a8 8 0 1 1-2.2-5.5" /><path d="M20 4v5h-5" /></Icon>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          {(statusFilter && statusFilter !== 'ALL') || (accountFilter && accountFilter !== 'all') || (dateFilter && dateFilter !== 'all') || searchFilter ? (
            <button type="button" className="dash-outline orders-clear-filters" onClick={clearFilters}>
              <Icon><path d="M4 5h16l-6 7v5l-4 2v-7L4 5z" /></Icon>
              Clear Filters
            </button>
          ) : null}
        </div>
      </div>

      {/* Table */}
      {scroll.loading && visibleOrders.length > 0 && (
        <div className="orders-loading-topbar">
          <div className="orders-loading-spinner is-small" />
          <span>Updating orders…</span>
        </div>
      )}
      {scroll.error ? (
        <p className="notice notice-error" role="alert">
          {scroll.error}{' '}
          <button type="button" className="dash-outline" onClick={scroll.retry}>Retry</button>
        </p>
      ) : null}
      <div className="table-wrap orders-table-wrap" ref={scroll.tableWrapRef}>
        <table className="orders-table">
          <thead>
            <tr style={{ background:'#F8FAFC' }}>
              <th className="orders-check" style={{ width: 36, padding: '8px 4px' }}><input type="checkbox" aria-label="Select orders on this page" checked={visibleOrders.length > 0 && visibleOrders.every((order) => selectedIds.has(order.id))} onChange={toggleAll} /></th>
              <th style={{ width: 44, padding: '8px 4px' }}>Image</th>
              <th style={{ minWidth: 150, maxWidth: 240 }}>Title / SKU</th>
              <th style={{ width: 145 }}>Posting #</th>
              <th style={{ width: 105 }}>Account</th>
              <th style={{ width: 120 }}>Status</th>
              <th style={{ width: 150 }}>Ship By</th>
              <th style={{ width: 130 }}>Price</th>
              <th style={{ width: 125, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scroll.loading && visibleOrders.length === 0 ? (
              <>
                <tr>
                  <td colSpan="9" style={{ padding: 0 }}>
                    <div className="orders-loading-banner">
                      <div className="orders-loading-spinner" />
                      <div>
                        <strong>Loading orders…</strong>
                        <span>Fetching latest records from Ozon</span>
                      </div>
                    </div>
                  </td>
                </tr>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <tr key={`orders-skeleton-${i}`} className="orders-skeleton-row">
                    <td style={{ width: 36, padding: '8px 4px', textAlign: 'center' }}>
                      <div className="orders-skeleton-box" style={{ width: 16, height: 16, margin: '0 auto', borderRadius: 4 }} />
                    </td>
                    <td style={{ width: 44, padding: '8px 4px' }}>
                      <div className="orders-skeleton-box" style={{ width: 38, height: 38, borderRadius: 6 }} />
                    </td>
                    <td>
                      <div className="orders-skeleton-box" style={{ width: '80%', height: 14, borderRadius: 4, marginBottom: 6 }} />
                      <div className="orders-skeleton-box" style={{ width: '45%', height: 11, borderRadius: 4 }} />
                    </td>
                    <td>
                      <div className="orders-skeleton-box" style={{ width: 120, height: 22, borderRadius: 6 }} />
                    </td>
                    <td>
                      <div className="orders-skeleton-box" style={{ width: 85, height: 20, borderRadius: 999 }} />
                    </td>
                    <td>
                      <div className="orders-skeleton-box" style={{ width: 95, height: 20, borderRadius: 999 }} />
                    </td>
                    <td>
                      <div className="orders-skeleton-box" style={{ width: 120, height: 15, borderRadius: 4 }} />
                    </td>
                    <td>
                      <div className="orders-skeleton-box" style={{ width: 75, height: 15, borderRadius: 4, marginBottom: 4 }} />
                      <div className="orders-skeleton-box" style={{ width: 95, height: 12, borderRadius: 4 }} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="orders-skeleton-box" style={{ width: 68, height: 26, borderRadius: 6, marginLeft: 'auto' }} />
                    </td>
                  </tr>
                ))}
              </>
            ) : visibleOrders.length === 0 ? (
              <tr>
                <td colSpan="9" className="orders-empty">
                  <strong>No orders match these filters.</strong>
                  <p>Try another status, account, or date.</p>
                  {(statusFilter && statusFilter !== 'ALL') || (accountFilter && accountFilter !== 'all') || (dateFilter && dateFilter !== 'all') || searchFilter ? (
                    <button type="button" className="dash-outline" onClick={clearFilters}>Clear filters</button>
                  ) : null}
                </td>
              </tr>
            ) : visibleOrders.map((order) => {
              const p  = order._parsed;
              const pr = p.products?.[0] || {};
              const fp = moneyFor(p, pr);
              const image = productImage(pr);
              
              const age = calculateAge(p.in_process_at);
              const shipDate = new Date(p.shipment_date);
              const hoursTilShip = p.shipment_date ? Math.floor((shipDate - new Date()) / (1000 * 60 * 60)) : 999;
              
              const saleAmount = amountOf(fp.price ?? pr.price);
              const saleCurrency = currencyOf(fp.price, '') || fp.currency_code || currencyOf(pr.price, '');
              const currencySymbol = saleCurrency === 'RUB' ? '₽' : saleCurrency === 'USD' ? '$' : saleCurrency === 'EUR' ? '€' : saleCurrency === 'INR' ? '₹' : '';
              const shipClass = hoursTilShip < 0 ? 'orders-ship is-late' : hoursTilShip < 24 ? 'orders-ship is-soon' : 'orders-ship';

              return (
                <tr key={order.id} className={selectedIds.has(order.id) ? 'is-selected' : ''} onClick={(e) => { if (e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'OPTION') setSelected(order); }}>
                  <td className="orders-check" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${order.posting_number}`} checked={selectedIds.has(order.id)} onChange={() => toggleOne(order.id)} />
                  </td>

                  {/* Image */}
                  <td style={{ width: 44, padding: '8px 4px' }}>
                    {image
                      ? <img src={image} alt="" loading="lazy" decoding="async" width={38} height={38} style={{ width:38, height:38, objectFit:'cover', borderRadius:6, border:'1px solid #E2E8F0' }} />
                      : <div style={{ width:38, height:38, background:'#F1F5F9', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', color:'#CBD5E1', fontSize:'9px' }}>IMG</div>
                    }
                  </td>

                  {/* Title & SKU */}
                  <td className="orders-title-cell">
                    <p className="orders-title" title={pr._russian_name ? `${pr.name}\n(Original: ${pr._russian_name})` : (pr.name || '')}>{pr.name || '—'}</p>
                    <p className="orders-sku">{pr.offer_id || '—'} · Qty: {pr.quantity}</p>
                  </td>

                  {/* Posting # */}
                  <td className="orders-posting">
                    <div className="orders-posting-pill">
                      <span>{order.posting_number}</span>
                      <button
                        type="button"
                        className="orders-posting-copy-btn"
                        title="Copy Posting Number"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigator.clipboard?.writeText(order.posting_number).then(() => {
                            setCopiedPosting(order.posting_number);
                            setTimeout(() => setCopiedPosting(''), 2000);
                          });
                        }}
                      >
                        {copiedPosting === order.posting_number ? (
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#10756F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>

                  <td>
                    <span className="orders-account-pill">{order._accountName}</span>
                  </td>

                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="orders-status">
                      <StatusBadge status={order.status} />
                    </div>
                  </td>

                  <td className="orders-ship-cell">
                    {p.shipment_date ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <span className="orders-ship-date">
                          {fmtDate(p.shipment_date)}
                        </span>
                        {hoursTilShip < 0 ? (
                          <span className="orders-sla-badge is-overdue" title={`Overdue by ${Math.abs(hoursTilShip)} hours`}>
                            🚨 {Math.abs(hoursTilShip)}h overdue
                          </span>
                        ) : hoursTilShip < 24 ? (
                          <span className="orders-sla-badge is-urgent" title={`Due in ${hoursTilShip} hours`}>
                            ⏳ {hoursTilShip}h left
                          </span>
                        ) : (
                          <span className="orders-sla-badge is-ok">
                            ✓ {Math.floor(hoursTilShip / 24)}d left
                          </span>
                        )}
                      </div>
                    ) : '—'}
                  </td>

                  <td className="orders-price">
                    {saleAmount == null ? '—' : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                          <strong style={{ color: '#0C5D58', fontSize: 13.5, fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>
                            {currencySymbol}{saleAmount.toLocaleString('en-IN')}
                          </strong>
                          {saleCurrency ? <span style={{ color: '#5A7572', fontSize: 11.5, fontWeight: 600 }}>{saleCurrency}</span> : null}
                        </div>
                        <span className="orders-payout-text" title="Estimated net payout after Ozon marketplace commission and logistics">
                          Est. Payout: {currencySymbol}{(Math.round(saleAmount * 0.82 * 100) / 100).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                  </td>

                  <td className="orders-actions" onClick={(event) => event.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                      {/* Suggestion 1: One-Click Print Label */}
                      <button
                        type="button"
                        className="orders-row-print-btn"
                        title="Print 4×6 Thermal Label (New Tab)"
                        disabled={printingRowId === order.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          printSingleOrderLabel(order.id);
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="6 9 6 2 18 2 18 9" />
                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                          <rect x="6" y="14" width="12" height="8" />
                        </svg>
                        <span>{printingRowId === order.id ? '...' : 'Print'}</span>
                      </button>

                      {/* Suggestion 3: Single-Click Quick Status Movement */}
                      {order.status === 'AWAITING_PACKAGING' && (
                        <button
                          type="button"
                          className="orders-quick-move-btn is-pack"
                          disabled={movingRowId === order.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            quickMoveStatus(order, 'awaiting_deliver');
                          }}
                          title="Mark order as Packed and move to Awaiting Delivery"
                        >
                          {movingRowId === order.id ? 'Packing...' : '📦 Pack'}
                        </button>
                      )}
                      {order.status === 'AWAITING_DELIVERY' && ['aggregator', 'non_integrated', '3pl_tracking', 'hybrid', ''].includes(String(p.tpl_integration_type || '')) && (
                        <button
                          type="button"
                          className="orders-quick-move-btn is-ship"
                          disabled={movingRowId === order.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            quickMoveStatus(order, 'delivering');
                          }}
                          title="Hand over to courier and move to In Transit"
                        >
                          {movingRowId === order.id ? 'Shipping...' : '🚚 Ship'}
                        </button>
                      )}

                      <button type="button" className="orders-icon-btn" aria-label={`Actions for ${order.posting_number}`} aria-expanded={menuId === order.id} onClick={() => setMenuId(menuId === order.id ? null : order.id)}>
                        <Icon><circle cx="12" cy="6" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="18" r="1.2" fill="currentColor" /></Icon>
                      </button>
                      {menuId === order.id && (
                        <div className="orders-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => { setSelected(order); setMenuId(null); }}>Open order</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {scroll.total > 0 ? (
        <ListPager
          label="Order pages"
          page={scroll.currentPage}
          pageCount={scroll.pageCount}
          start={scroll.rangeStart}
          end={scroll.rangeEnd}
          total={scroll.total}
          pageSize={UI_BATCH}
          noun={scroll.total === 1 ? 'order' : 'orders'}
          onPage={scroll.goToPage}
        />
      ) : null}

      <OrderDrawer order={selected} onClose={() => setSelected(null)} />
      {statusChange && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', zIndex:120, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px' }}>
          <div style={{ width:'min(440px, 100%)', background:'#fff', borderRadius:'12px', padding:'20px', boxShadow:'0 16px 40px rgba(0,0,0,0.18)' }}>
            <p style={{ fontSize:'16px', fontWeight:700, marginBottom:'8px' }}>Update {statusChange.ids.length} order{statusChange.ids.length === 1 ? '' : 's'} on Ozon</p>
            <p style={{ fontSize:'13px', color:'#475569', marginBottom:'14px' }}>The new status is {TARGET_LABEL[statusChange.target]}. Ozon receives this change for the seller account on each order.</p>
            {statusChange.target === 'cancelled' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'12px' }}>
                <select value={statusChange.reasonId} onChange={(event) => setStatusChange({ ...statusChange, reasonId: event.target.value })}>
                  <option value="">Cancellation reason</option>
                  {statusChange.reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.title}</option>)}
                </select>
                <input value={statusChange.message} onChange={(event) => setStatusChange({ ...statusChange, message: event.target.value })} placeholder="Note for Ozon, if the reason needs one" />
              </div>
            )}
            {statusChange.error && <p style={{ fontSize:'12px', color:'#B91C1C', marginBottom:'12px' }}>{statusChange.error}</p>}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'8px' }}>
              <button type="button" className="button-secondary" onClick={() => setStatusChange(null)} disabled={statusBusy}>Cancel</button>
              <button type="button" onClick={confirmStatusChange} disabled={statusBusy}>{statusBusy ? 'Updating Ozon...' : 'Update on Ozon'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
