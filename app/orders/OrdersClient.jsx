'use client';
import { useState } from 'react';

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

function moneyFor(order, product) {
  const rows = order?.financial_data?.products || [];
  return rows.find((row) => row.product_id == product?.offer_id || row.product_id == product?.product_id || row.product_id == product?.sku)
    || rows[0]
    || {};
}

function StatusBadge({ status }) {
  const cfg = STATUS_COLOR[status] || { bg: '#F1F5F9', color: '#475569' };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {STATUS_LABEL[status] || status}
    </span>
  );
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
              <Row label="Customer Paid" value={`₹${d.financial_data.products[0].customer_price?.toLocaleString('en-IN')}`} />
              <Row label="List Price"    value={`$${d.financial_data.products[0].old_price} USD`} />
              <Row label="Sale Price"    value={`$${d.financial_data.products[0].price} USD`} />
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

export default function OrdersClient({ orders, statusCounts, accounts, currentStatus, currentAccount, currentDate, currentSearch }) {
  const [selected, setSelected] = useState(null);

  const buildUrl = (params) => {
    const u = new URLSearchParams();
    if (params.status  ?? currentStatus)  u.set('status',  params.status  ?? currentStatus);
    if (params.account ?? currentAccount) u.set('account', params.account ?? currentAccount);
    if (params.date    ?? currentDate)    u.set('date',    params.date    ?? currentDate);
    if (params.q       ?? currentSearch)  u.set('q',       params.q       ?? currentSearch);
    return `/orders?${u.toString()}`;
  };

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
  
  const toggleAll = () => {
      if (selectedIds.size === orders.length) setSelectedIds(new Set());
      else setSelectedIds(new Set(orders.map(o => o.id)));
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

  const exportSelectedCsv = () => {
      if (selectedIds.size === 0) return alert('Select orders first');
      const subset = orders.filter(o => selectedIds.has(o.id));
      const headers = ['Posting Number', 'Status', 'Account', 'Title', 'SKU', 'Qty', 'Ship By'];
      const rows = subset.map(o => {
          const p = o._parsed;
          const pr = p.products?.[0] || {};
          return [ o.posting_number, o.status, o._accountName, pr.name, pr.offer_id, pr.quantity, p.shipment_date ].map(c => `"${c||''}"`).join(',');
      });
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'orders_export.csv'; a.click();
  };

  return (
    <div>
      <header className="page-head">
        <h1>Orders</h1>
        <p className="page-lead">Filter by status, account, or date. Select a row to open the order details.</p>
      </header>
      <div className="tabs">
        {STATUS_TABS.map(tab => {
          const active = (currentStatus || 'ALL') === tab.key;
          return (
            <a key={tab.key} href={buildUrl({ status: tab.key })} className={active ? 'tab tab-active' : 'tab'} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {tab.label}
              <span style={{
                background: active ? '#DBEAFE' : '#F1F5F9',
                color: active ? '#1E40AF' : '#64748B',
                borderRadius:'10px', padding:'1px 7px', fontSize:'11px', fontWeight:700
              }}>
                {tab.key === 'ALL' ? statusCounts._total : (statusCounts[tab.key] || 0)}
              </span>
            </a>
          );
        })}
      </div>

      {/* Filters Row */}
      <div className="filter-row">
        <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
          {DATE_FILTERS.map(df => (
            <a key={df.key} href={buildUrl({ date: df.key })} className={(currentDate||'all')===df.key ? 'chip chip-active' : 'chip'}>{df.label}</a>
          ))}
        </div>

        <select defaultValue={currentAccount||'all'}
          onChange={e => window.location.href = buildUrl({ account: e.target.value })}
          style={{ padding:'5px 10px', borderRadius:'6px', fontSize:'12px', border:'1px solid #E2E8F0', background:'#fff' }}>
          <option value="all">All Accounts</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <form method="get" action="/orders" style={{ display:'flex', gap:'4px', marginLeft:'auto' }}>
          <input type="hidden" name="status" value={currentStatus||'ALL'} />
          <input type="hidden" name="date" value={currentDate||'all'} />
          <input type="hidden" name="account" value={currentAccount||'all'} />
          <input name="q" defaultValue={currentSearch||''} placeholder="Search posting #, SKU, title..." style={{ padding:'5px 12px', borderRadius:'6px', fontSize:'12px', width:'260px', border:'1px solid #E2E8F0' }} />
          <button type="submit" style={{ padding:'5px 12px', fontSize:'12px' }}>Search</button>
          {currentSearch && <a href={buildUrl({ q:'' })} style={{ padding:'5px 10px', background:'#F1F5F9', color:'#475569', borderRadius:'6px', fontSize:'12px', textDecoration:'none', display:'flex', alignItems:'center' }}>✕</a>}
        </form>
      </div>

      {/* Bulk actions & Count */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
        <p style={{ fontSize:'12px', color:'#64748B' }}>{orders.length} order{orders.length!==1?'s':''} shown</p>
        
        {selectedIds.size > 0 && (
           <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
              <span style={{ fontSize:'12px', fontWeight:600 }}>{selectedIds.size} selected</span>
              <button type="button" className="button-secondary" onClick={exportSelectedCsv} style={{ padding:'4px 10px', fontSize:'12px' }}>Export Excel</button>
              <button type="button" className="button-secondary" onClick={() => alert('PDF export requires pipeline execution. Please click Run Pipeline on the dashboard.')} style={{ padding:'4px 10px', fontSize:'12px' }}>Export PDF</button>
           </div>
        )}
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#F8FAFC' }}>
              <th style={{ padding:'10px 12px', width:'40px' }}><input type="checkbox" checked={orders.length > 0 && selectedIds.size === orders.length} onChange={toggleAll} /></th>
              {['Image','Title / SKU','Posting #','Account','Status & Age','Ship By','Price','Whse'].map(h => (
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:'11px', fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'0.04em', borderBottom:'1px solid #E2E8F0', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan="9" className="empty-cell">No orders yet for this filter.</td></tr>
            ) : orders.map((order, idx) => {
              const p  = order._parsed;
              const pr = p.products?.[0] || {};
              const fp = moneyFor(p, pr);
              const image = productImage(pr);
              
              const age = calculateAge(p.in_process_at);
              const shipDate = new Date(p.shipment_date);
              const hoursTilShip = p.shipment_date ? Math.floor((shipDate - new Date()) / (1000 * 60 * 60)) : 999;
              
              let currencySymbol = fp.currency_code === 'RUB' ? '₽' : fp.currency_code === 'USD' ? '$' : fp.currency_code === 'EUR' ? '€' : '';

              return (
                <tr key={order.id} onClick={(e) => { if(e.target.type !== 'checkbox') setSelected(order); }}
                  style={{ cursor:'pointer', borderBottom:'1px solid #F1F5F9', background: idx%2===0 ? '#fff' : '#FAFAFA', transition:'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background='#EFF6FF'}
                  onMouseLeave={e => e.currentTarget.style.background=idx%2===0?'#fff':'#FAFAFA'}>

                  {/* Checkbox */}
                  <td style={{ padding:'10px 12px' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(order.id)} onChange={() => toggleOne(order.id)} />
                  </td>

                  {/* Image */}
                  <td style={{ padding:'10px 12px' }}>
                    {image
                      ? <img src={image} alt="" style={{ width:44, height:44, objectFit:'cover', borderRadius:6, border:'1px solid #E2E8F0' }} />
                      : <div style={{ width:44, height:44, background:'#F1F5F9', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', color:'#CBD5E1', fontSize:'9px' }}>IMG</div>
                    }
                  </td>

                  {/* Title & SKU */}
                  <td style={{ padding:'10px 12px', maxWidth:'220px' }}>
                    <p style={{ fontSize:'12px', color:'#1E293B', marginBottom:'3px', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{pr.name || '—'}</p>
                    <p style={{ fontSize:'11px', color:'#64748B', fontFamily:'monospace' }}>{pr.offer_id || '—'}  •  Qty: {pr.quantity}</p>
                  </td>

                  {/* Posting # */}
                  <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:'11px', color:'#1E40AF', whiteSpace:'nowrap' }}>{order.posting_number}</td>

                  {/* Account */}
                  <td style={{ padding:'10px 12px' }}>
                    <span style={{ fontSize:'11px', fontWeight:600, color:'#475569', background:'#F1F5F9', padding:'3px 8px', borderRadius:'6px' }}>{order._accountName}</span>
                  </td>

                  {/* Status & Age */}
                  <td style={{ padding:'10px 12px' }}>
                     <StatusBadge status={order.status} /><br />
                     <span style={{ fontSize:'10px', color:'#94A3B8', marginTop:'4px', display:'inline-block' }}>{age} Days Old</span>
                  </td>

                  {/* Ship By */}
                  <td style={{ padding:'10px 12px', fontSize:'12px', whiteSpace:'nowrap' }}>
                    {p.shipment_date ? (
                      <div>
                         <span style={{ color: hoursTilShip < 0 ? '#DC2626' : hoursTilShip < 24 ? '#D97706' : '#059669', fontWeight:600 }}>
                           {fmtDate(p.shipment_date)}
                         </span>
                         <br/>
                         {hoursTilShip < 0 ? <span style={{fontSize:'10px', color:'#DC2626'}}>🔴 Overdue</span> : 
                          hoursTilShip < 24 ? <span style={{fontSize:'10px', color:'#D97706'}}>⚠ Due Soon</span> : ''}
                      </div>
                    ) : '—'}
                  </td>

                  {/* Exact Price */}
                  <td style={{ padding:'10px 12px', fontSize:'13px', whiteSpace:'nowrap' }}>
                    <span style={{ fontWeight:700 }}>{currencySymbol}{fp.price || pr.price || '0.00'}</span><br/>
                    <span style={{ fontSize:'10px', color:'#94A3B8' }}>{fp.currency_code}</span>
                  </td>

                  {/* Warehouse */}
                  <td style={{ padding:'10px 12px', fontSize:'11px', color:'#475569', maxWidth:'100px' }}>{p.delivery_method?.warehouse || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <OrderDrawer order={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
