'use client';
import { useEffect, useState } from 'react';
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
  AWAITING_PACKAGING: { bg: '#FEF3C7', color: '#92400E' },
  AWAITING_DELIVERY:  { bg: '#DBEAFE', color: '#1E40AF' },
  IN_TRANSIT:         { bg: '#EDE9FE', color: '#5B21B6' },
  DELIVERED:          { bg: '#D1FAE5', color: '#065F46' },
  CANCELLED:          { bg: '#FEE2E2', color: '#991B1B' },
  ARBITRATION:        { bg: '#FEE2E2', color: '#991B1B' },
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
    <span className="orders-badge" style={{ background: cfg.bg, color: cfg.color }}>
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

function TabIcon({ name }) {
  if (name === 'ALL') return <Icon><circle cx="9" cy="20" r="1" /><circle cx="18" cy="20" r="1" /><path d="M3 4h2l2.4 11h11.2l1.6-7H7" /></Icon>;
  if (name === 'AWAITING_PACKAGING') return <Icon><path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Z" /><path d="M3 7.5V16.5L12 21l9-4.5V7.5" /><path d="M12 12v9" /></Icon>;
  if (name === 'AWAITING_DELIVERY') return <Icon><path d="M3 7h11v8H3z" /><path d="M14 10h4l3 3v2h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></Icon>;
  if (name === 'IN_TRANSIT') return <Icon><path d="M3 12h11" /><path d="m14 12 7-4v8z" /><path d="M6 16h.01M10 16h.01" /></Icon>;
  if (name === 'DELIVERED') return <Icon><circle cx="12" cy="12" r="8" /><path d="m8.5 12.2 2.3 2.3 4.7-5" /></Icon>;
  return <Icon><circle cx="12" cy="12" r="8" /><path d="m9 9 6 6M15 9l-6 6" /></Icon>;
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
        <div style={{ padding:'20px 24px', borderBottom:'1px solid #E2E8F0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <p style={{ fontSize:'11px', color:'#64748B', marginBottom:'4px', fontWeight:600, textTransform:'uppercase' }}>Posting Number</p>
            <p style={{ fontSize:'15px', fontWeight:700, fontFamily:'monospace' }}>{order.posting_number}</p>
          </div>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            <StatusBadge status={order.status} />
            <button onClick={onClose} style={{ background:'#F1F5F9', color:'#475569', padding:'6px 12px', fontSize:'13px' }}>✕ Close</button>
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
                  <img src={image} alt={p.offer_id || ''} style={{ width:64, height:64, objectFit:'cover', borderRadius:8, flexShrink:0, border:'1px solid #E2E8F0' }} />
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
      <p style={{ fontSize:'11px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'10px' }}>{title}</p>
      <div style={{ background:'#F8FAFC', borderRadius:'8px', padding:'12px 14px' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid #EFF2F7', fontSize:'13px' }}>
      <span style={{ color:'#64748B' }}>{label}</span>
      <span style={{ color:'#1E293B', fontWeight:500, textAlign:'right', maxWidth:'260px' }}>{value || '—'}</span>
    </div>
  );
}

export default function OrdersClient({ orders, statusCounts, accounts, currentStatus, currentAccount, currentDate, currentSearch, filteredCount = 0 }) {
  const router = useRouter();
  const [selected, setSelected] = useState(null);
  const [statusOverrides, setStatusOverrides] = useState({});
  const [statusChange, setStatusChange] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [statusFilter, setStatusFilter] = useState(currentStatus || 'ALL');
  const [accountFilter, setAccountFilter] = useState(currentAccount || 'all');
  const [dateFilter, setDateFilter] = useState(currentDate || 'all');
  const [searchFilter, setSearchFilter] = useState(currentSearch || '');
  const [counts, setCounts] = useState(statusCounts || {});
  const scroll = useBatchScroll({
    initialItems: orders,
    initialTotal: filteredCount,
    resetKey: `${statusFilter}|${accountFilter}|${dateFilter}|${searchFilter}`,
    pageMode: true,
    loadPage: async (page) => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(FETCH_SIZE),
        status: statusFilter || 'ALL',
        account: accountFilter || 'all',
        date: dateFilter || 'all',
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
    if (patch.date != null) setDateFilter(patch.date);
    if (patch.q != null) setSearchFilter(patch.q);
  }

  function clearFilters() {
    setStatusFilter('ALL');
    setAccountFilter('all');
    setDateFilter('all');
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
    { key: 'week',      label: 'Last 7 Days' },
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
      q: searchFilter,
    });
  }, [searchFilter, statusFilter, accountFilter, dateFilter]);
  
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
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setPdfError(data.error || 'The PDF could not be created.');
        return;
      }
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'orders.pdf';
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
          <p>Manage fulfillment, track delivery deadlines, and update order statuses.</p>
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
        </div>

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
            <input name="q" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search posting #, SKU, title..." aria-label="Search orders" />
            {query ? (
              <button type="button" className="orders-clear" aria-label="Clear search" onClick={() => { setQuery(''); applyFilters({ q: '' }); }}>×</button>
            ) : null}
          </span>
          <button type="submit" className="dash-primary" disabled={searching}>
            {searching ? null : <Icon><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></Icon>}
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>
        <button type="button" className="dash-outline" onClick={exportSelectedExcel} disabled={excelBusy || (selectedIds.size === 0 && scroll.loaded.length === 0)}>
          <Icon><path d="M12 4v10" /><path d="m8 10 4 4 4-4" /><path d="M5 19h14" /></Icon>
          {excelBusy ? 'Building Excel...' : 'Export Excel'}
        </button>
      </div>

      <div className="orders-meta">
        <p>
          <strong className="orders-count">{`${scroll.total.toLocaleString('en-US')} ${scroll.total === 1 ? 'order' : 'orders'}`}</strong>
          {statusFilter && statusFilter !== 'ALL' ? <button type="button" className="orders-chip" onClick={() => applyFilters({ status: 'ALL' })}>Status: {STATUS_LABEL[statusFilter] || statusFilter} ×</button> : null}
          {dateFilter && dateFilter !== 'all' ? <button type="button" className="orders-chip" onClick={() => applyFilters({ date: 'all' })}>Date: {DATE_FILTERS.find((item) => item.key === dateFilter)?.label || dateFilter} ×</button> : null}
          {accountFilter && accountFilter !== 'all' ? <button type="button" className="orders-chip" onClick={() => applyFilters({ account: 'all' })}>Account: {accounts.find((account) => account.id === accountFilter)?.name || 'Account'} ×</button> : null}
          {searchFilter ? <button type="button" className="orders-chip" onClick={() => { setQuery(''); applyFilters({ q: '' }); }}>Search: {searchFilter} ×</button> : null}
          {pdfError ? <span className="orders-note is-bad" role="alert">{pdfError}</span> : null}
          {statusNote ? <span className="orders-note is-ok" role="status">{statusNote}</span> : null}
        </p>
        <div className="orders-bulk">
          <label className="orders-selected">
            <input type="checkbox" aria-label="Select orders on this page" checked={visibleOrders.length > 0 && visibleOrders.every((order) => selectedIds.has(order.id))} onChange={toggleAll} />
            {selectedIds.size} selected
          </label>
          <select defaultValue="" aria-label="Change selected orders on Ozon" disabled={statusBusy || selectedIds.size === 0} onChange={(event) => { const value = event.target.value; event.target.value = ''; openStatusChange([...selectedIds], value); }}>
            <option value="">{statusBusy ? 'Updating...' : 'Change on Ozon'}</option>
            {['awaiting_deliver', 'delivering', 'delivered', 'cancelled'].map((status) => (
              <option key={status} value={status}>{TARGET_LABEL[status]}</option>
            ))}
          </select>
          {selectedIds.size > 0 && (
            <>
              <button type="button" className="dash-outline" onClick={exportSelectedPdf} disabled={pdfBusy || Boolean(docBusy)}>{pdfBusy ? 'Building PDF...' : 'Export PDF'}</button>
              <button type="button" className="dash-outline" onClick={() => downloadOzonDocument('shipping')} disabled={Boolean(docBusy) || !visibleOrders.some((order) => selectedIds.has(order.id) && waitingForPickup(order))}>{docBusy === 'shipping' ? 'Downloading...' : 'Ozon labels'}</button>
              <button type="button" className="dash-outline" onClick={() => downloadOzonDocument('product')} disabled={Boolean(docBusy)}>{docBusy === 'product' ? 'Downloading...' : 'Ozon product list'}</button>
            </>
          )}
          <button type="button" className="dash-outline orders-refresh" onClick={() => router.refresh()}>
            <Icon><path d="M20 12a8 8 0 1 1-2.2-5.5" /><path d="M20 4v5h-5" /></Icon>
            Refresh
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
      {scroll.loading ? <p className="page-lead">Loading the next 100 orders…</p> : null}
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
              <th className="orders-check"><input type="checkbox" aria-label="Select orders on this page" checked={visibleOrders.length > 0 && visibleOrders.every((order) => selectedIds.has(order.id))} onChange={toggleAll} /></th>
              {['Image','Title / SKU','Posting #','Account','Status & Age','Ship By','Price','Whse','Actions'].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleOrders.length === 0 ? (
              <tr>
                <td colSpan="10" className="orders-empty">
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
                  <td style={{ padding:'10px 12px' }}>
                    {image
                      ? <img src={image} alt="" style={{ width:44, height:44, objectFit:'cover', borderRadius:6, border:'1px solid #E2E8F0' }} />
                      : <div style={{ width:44, height:44, background:'#F1F5F9', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', color:'#CBD5E1', fontSize:'9px' }}>IMG</div>
                    }
                  </td>

                  {/* Title & SKU */}
                  <td className="orders-title-cell">
                    <p className="orders-title" title={pr.name || ''}>{pr.name || '—'}</p>
                    <p className="orders-sku">{pr.offer_id || '—'} · Qty: {pr.quantity}</p>
                  </td>

                  {/* Posting # */}
                  <td className="orders-posting">
                    <span>{order.posting_number}</span>
                    <button type="button" className="orders-icon-btn" aria-label={`Copy ${order.posting_number}`} onClick={(event) => { event.stopPropagation(); navigator.clipboard?.writeText(order.posting_number); }}>
                      <Icon><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V5h10" /></Icon>
                    </button>
                  </td>

                  <td>
                    <span className="orders-account-pill">{order._accountName}</span>
                  </td>

                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="orders-status">
                      <div>
                        <StatusBadge status={order.status} />
                        {nextTargets(order).length > 0 && (
                          <select defaultValue="" disabled={statusBusy} aria-label={`Change ${order.posting_number} on Ozon`} onChange={(event) => { const value = event.target.value; event.target.value = ''; openStatusChange([order.id], value); }}>
                            <option value="">{statusBusy ? 'Updating...' : 'Change on Ozon'}</option>
                            {nextTargets(order).map((status) => <option key={status} value={status}>{TARGET_LABEL[status]}</option>)}
                          </select>
                        )}
                      </div>
                      <span className="orders-age">{age} Days Old</span>
                    </div>
                  </td>

                  <td>
                    {p.shipment_date ? (
                      <div className={shipClass}>
                        <Icon><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></Icon>
                        <span>
                          {fmtDate(p.shipment_date)}
                          {hoursTilShip < 0 ? <small>Overdue</small> : hoursTilShip < 24 ? <small>Due soon</small> : null}
                        </span>
                      </div>
                    ) : '—'}
                  </td>

                  <td className="orders-price">
                    {saleAmount == null ? '—' : (
                      <>
                        <strong>{currencySymbol}{saleAmount.toLocaleString('en-IN')}</strong>
                        {saleCurrency ? <span>{saleCurrency}</span> : null}
                      </>
                    )}
                  </td>

                  <td className="orders-whse">{p.delivery_method?.warehouse || '—'}</td>
                  <td className="orders-actions" onClick={(event) => event.stopPropagation()}>
                    <button type="button" className="orders-icon-btn" aria-label={`Actions for ${order.posting_number}`} aria-expanded={menuId === order.id} onClick={() => setMenuId(menuId === order.id ? null : order.id)}>
                      <Icon><circle cx="12" cy="6" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="18" r="1.2" fill="currentColor" /></Icon>
                    </button>
                    {menuId === order.id && (
                      <div className="orders-menu" role="menu">
                        <button type="button" role="menuitem" onClick={() => { setSelected(order); setMenuId(null); }}>Open order</button>
                      </div>
                    )}
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
