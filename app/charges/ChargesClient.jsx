'use client';

import { useState, useMemo, useEffect } from 'react';

// Indian Rupee currency formatter with standard en-IN comma separation
function fmtCurrency(val) {
  const num = Number(val) || 0;
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getInitialMonthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

export default function ChargesClient({ initialData = {}, accounts = [] }) {
  const defaultRange = getInitialMonthRange();
  const [data, setData] = useState(initialData);
  const [hasLoaded, setHasLoaded] = useState(Boolean(initialData?.orders?.length));
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [dateFrom, setDateFrom] = useState(initialData.dateRange?.from || defaultRange.from);
  const [dateTo, setDateTo] = useState(initialData.dateRange?.to || defaultRange.to);
  const [activePreset, setActivePreset] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // Active Tab: 'sales' | 'unmapped' | 'reconciliation' | 'comparison'
  const [activeTab, setActiveTab] = useState('sales');

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Pagination for Sales Report table
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Expanded row IDs
  const [expandedRowIds, setExpandedRowIds] = useState(new Set());

  // Checkbox selections for export
  const [selectedOrderIds, setSelectedOrderIds] = useState(new Set());

  // Manual Ozon UI Comparison inputs (in ₹)
  const [manualGross, setManualGross] = useState('');
  const [manualDeductions, setManualDeductions] = useState('');
  const [manualNet, setManualNet] = useState('');

  const summary = data.summary || {
    orderCount: 0,
    itemCount: 0,
    grossSales: 0,
    returns: 0,
    netSales: 0,
    ozonDeductions: 0,
    mappedDeductions: 0,
    unmappedDeductions: 0,
    netSellerAmount: 0,
    effectiveDeductionRate: '0.0',
    currency: 'INR',
  };

  const orders = data.orders || [];
  const unmapped = data.unmappedCharges || [];
  const reconciliation = data.reconciliation || [];

  // Filtered orders for Tab 1
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status?.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchPosting = order.postingNumber?.toLowerCase().includes(q);
      const matchOrder = order.orderNumber?.toLowerCase().includes(q);
      const matchProduct = order.products?.some(
        (p) =>
          p.title?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.offerId?.toLowerCase().includes(q)
      );
      return matchPosting || matchOrder || matchProduct;
    });
  }, [orders, statusFilter, searchQuery]);

  // Reset to page 1 on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, pageSize]);

  // Paginated Orders for current view
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Core Load Charges function (handles optional parameter overrides to avoid stale React closures)
  async function fetchCharges(accountId = selectedAccountId, from = dateFrom, to = dateTo) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        account: accountId,
        from,
        to,
      });
      const res = await fetch(`/api/charges?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to fetch Ozon charges.');
      }
      setData(json);
      setHasLoaded(true);
      setExpandedRowIds(new Set());
      setSelectedOrderIds(new Set());
      setCurrentPage(1);
    } catch (err) {
      setError(err.message || 'Error loading charges.');
    } finally {
      setLoading(false);
    }
  }

  // Handle Form Submit
  function handleLoadCharges(e) {
    if (e) e.preventDefault();
    setActivePreset('');
    fetchCharges(selectedAccountId, dateFrom, dateTo);
  }

  // Quick Date Range Presets: updates dates AND auto-fetches immediately
  function applyDatePreset(presetKey) {
    setActivePreset(presetKey);
    const now = new Date();
    let newFrom = '';
    let newTo = '';

    if (presetKey === 'this_month') {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      newFrom = `${y}-${m}-01`;
      newTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    } else if (presetKey === 'last_month') {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const y = prevMonth.getFullYear();
      const m = String(prevMonth.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, prevMonth.getMonth() + 1, 0).getDate();
      newFrom = `${y}-${m}-01`;
      newTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    } else if (presetKey === 'last_30_days') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      newFrom = past.toISOString().split('T')[0];
      newTo = now.toISOString().split('T')[0];
    } else if (presetKey === 'last_90_days') {
      const past = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      newFrom = past.toISOString().split('T')[0];
      newTo = now.toISOString().split('T')[0];
    }

    if (newFrom && newTo) {
      setDateFrom(newFrom);
      setDateTo(newTo);
      fetchCharges(selectedAccountId, newFrom, newTo);
    }
  }

  // Toggle Row Expansion
  function toggleRowExpand(id) {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Toggle Order Selection
  function toggleSelectOrder(id) {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAll(e) {
    if (e.target.checked) {
      setSelectedOrderIds(new Set(filteredOrders.map((o) => o.id)));
    } else {
      setSelectedOrderIds(new Set());
    }
  }

  // Download styled Excel report (.xlsx) matching Image 2 using ExcelJS
  async function handleExportExcel(type = 'all') {
    if (exporting) return;
    setExporting(true);
    try {
      const selectedIds = type === 'selected' ? Array.from(selectedOrderIds) : [];
      const res = await fetch('/api/charges/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          from: dateFrom,
          to: dateTo,
          selectedIds,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to download Excel report.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Ozon_Order_Charges_${dateFrom}_to_${dateTo}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Error exporting Excel file.');
    } finally {
      setExporting(false);
    }
  }

  // Delta calculations for Ozon UI Comparison Tool in Rupees
  const comparisonCalculations = useMemo(() => {
    const mGross = parseFloat(manualGross);
    const mDeduct = parseFloat(manualDeductions);
    const mNet = parseFloat(manualNet);

    const grossDelta = !isNaN(mGross) ? summary.grossSales - mGross : null;
    const deductDelta = !isNaN(mDeduct) ? summary.ozonDeductions - mDeduct : null;
    const netDelta = !isNaN(mNet) ? summary.netSellerAmount - mNet : null;

    const hasAnyInput = !isNaN(mGross) || !isNaN(mDeduct) || !isNaN(mNet);
    const perfectMatch =
      hasAnyInput &&
      (!isNaN(mGross) ? Math.abs(grossDelta) < 1.0 : true) &&
      (!isNaN(mDeduct) ? Math.abs(deductDelta) < 1.0 : true) &&
      (!isNaN(mNet) ? Math.abs(netDelta) < 1.0 : true);

    return {
      mGross,
      mDeduct,
      mNet,
      grossDelta,
      deductDelta,
      netDelta,
      hasAnyInput,
      perfectMatch,
    };
  }, [manualGross, manualDeductions, manualNet, summary]);

  return (
    <div className="charges-page-wrap" style={{ padding: '4px 0 40px' }}>
      {/* ── CSS HOVER STYLES FOR QUICK PERIODS & TABLE PAGINATION ────── */}
      <style jsx>{`
        .quick-period-btn {
          height: 38px;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 650;
          border-radius: 8px;
          border: 1px solid #ccece8;
          background: #ffffff;
          color: #475569;
          cursor: pointer;
          transition: all 0.15s ease-in-out;
        }
        .quick-period-btn:hover {
          background: #e8f5f4 !important;
          color: #0c5d58 !important;
          border-color: #10756f !important;
          transform: translateY(-1px);
          box-shadow: 0 2px 5px rgba(16, 117, 111, 0.12);
        }
        .quick-period-btn.active {
          background: #10756f !important;
          color: #ffffff !important;
          border-color: #10756f !important;
          box-shadow: 0 2px 4px rgba(16, 117, 111, 0.2);
        }
        .charges-page-btn {
          min-width: 32px;
          height: 32px;
          padding: 0 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12.5px;
          font-weight: 600;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          color: #334155;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .charges-page-btn:hover:not(:disabled) {
          border-color: #10756f;
          color: #10756f;
          background: #f0fdf4;
        }
        .charges-page-btn.active {
          background: #10756f;
          color: #ffffff;
          border-color: #10756f;
          font-weight: 700;
        }
        .charges-page-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
      `}</style>

      {/* ── TOP HEADER ──────────────────────────────────────────────── */}
      <div
        className="charges-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: '#0F172A',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Ozon Order Charges
        </h1>

        {/* Global Export Excel Action (Only shown when charges are loaded) */}
        {hasLoaded && filteredOrders.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="dash-outline"
              disabled={exporting}
              onClick={() => handleExportExcel('all')}
              title="Download formatted Excel workbook (.xlsx)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                height: 38,
                padding: '0 14px',
                fontSize: 13,
                opacity: exporting ? 0.6 : 1,
                cursor: exporting ? 'not-allowed' : 'pointer',
              }}
            >
              {exporting ? (
                <>
                  <span
                    className="orders-loading-spinner"
                    style={{ width: 13, height: 13, borderWidth: 2 }}
                  />
                  <span>Generating Excel…</span>
                </>
              ) : (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Export Excel</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── FILTER & DATE CONTROLS BAR (Deep Teal Card) ────────────────── */}
      <form
        onSubmit={handleLoadCharges}
        style={{
          background: '#FFFFFF',
          border: '1px solid #CCECE8',
          borderRadius: 14,
          padding: '16px 20px',
          boxShadow: '0 1px 4px rgba(16, 117, 111, 0.05)',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {/* Account Selector & Date Inputs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#0C5D58',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Store Account
              </label>
              <select
                className="reports-select"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                style={{ height: 38, minWidth: 170, fontSize: 13 }}
              >
                <option value="all">All Accounts</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range: FROM */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#0C5D58',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                From Date
              </label>
              <input
                type="date"
                className="pipe-date-input"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setActivePreset('');
                }}
                style={{ height: 38, fontSize: 13, padding: '0 10px' }}
              />
            </div>

            {/* Date Range: TO */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#0C5D58',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                To Date
              </label>
              <input
                type="date"
                className="pipe-date-input"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setActivePreset('');
                }}
                style={{ height: 38, fontSize: 13, padding: '0 10px' }}
              />
            </div>
          </div>

          {/* Quick Presets & Load Charges Button */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            {/* Quick Period Presets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#5A7572',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Quick Period
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { id: 'this_month', label: 'This Month' },
                  { id: 'last_30_days', label: 'Last 30 Days' },
                  { id: 'last_month', label: 'Last Month' },
                  { id: 'last_90_days', label: 'Last 90 Days' },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`quick-period-btn ${activePreset === preset.id ? 'active' : ''}`}
                    onClick={() => applyDatePreset(preset.id)}
                    title={`Filter by ${preset.label}`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Load Button */}
            <button
              type="submit"
              className="dash-primary"
              disabled={loading}
              style={{
                height: 38,
                padding: '0 20px',
                fontSize: 13.5,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {loading ? (
                <>
                  <span
                    className="orders-loading-spinner"
                    style={{ width: 14, height: 14, borderWidth: 2 }}
                  />
                  <span>Loading…</span>
                </>
              ) : (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  <span>Load Charges</span>
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <p className="notice notice-error" style={{ marginTop: 14, marginBottom: 0 }}>
            {error}
          </p>
        )}
      </form>

      {/* ── CONDITIONAL RENDER: TABLE & RESULTS HIDDEN UNTIL USER LOADS CHARGES ── */}
      {!hasLoaded ? (
        <div
          style={{
            background: '#FFFFFF',
            border: '1px dashed #B2E0DC',
            borderRadius: 14,
            padding: '56px 24px',
            textAlign: 'center',
            boxShadow: '0 1px 4px rgba(16, 117, 111, 0.04)',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#E8F5F4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#10756F',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16l3-1.5 3 1.5 3-1.5 3 1.5 3-1.5 3 1.5V8z" />
              <path d="M14 2v6h6" />
              <path d="M8 13h4" />
              <path d="M8 17h8" />
            </svg>
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 750, color: '#0F172A', margin: '0 0 8px' }}>
            Ready to Load Order Charges
          </h3>
          <p
            style={{
              fontSize: 13.5,
              color: '#64748B',
              maxWidth: 480,
              margin: '0 auto 22px',
              lineHeight: 1.55,
            }}
          >
            Select a store account and date range above, then click <strong>Load Charges</strong> or
            choose a <strong>Quick Period</strong> preset (e.g. <em>This Month</em>) to calculate order
            deductions, commission, and net seller payout.
          </p>
          <button
            type="button"
            onClick={() => fetchCharges(selectedAccountId, dateFrom, dateTo)}
            className="dash-primary"
            disabled={loading}
            style={{
              height: 40,
              padding: '0 24px',
              fontSize: 13.5,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Loading…' : 'Load Charges Now'}
          </button>
        </div>
      ) : (
        <>
          {/* ── 6 EXECUTIVE SUMMARY KPI METRIC CARDS (ALL IN RUPEES ₹) ────── */}
          <div
            className="charges-kpis-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
              marginBottom: 24,
            }}
          >
            {/* Card 1: Orders & Units */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #CCECE8',
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: '0 1px 3px rgba(12, 93, 88, 0.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#5A7572',
                    textTransform: 'uppercase',
                  }}
                >
                  Orders & Items
                </span>
                <span style={{ fontSize: 18 }}>📦</span>
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#0F172A',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {summary.orderCount}{' '}
                <span style={{ fontSize: 13, fontWeight: 500, color: '#64748B' }}>orders</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#059669', fontWeight: 650, marginTop: 4 }}>
                {summary.itemCount} total units sold
              </div>
            </div>

            {/* Card 2: Gross Sales (₹) */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #CCECE8',
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: '0 1px 3px rgba(12, 93, 88, 0.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#5A7572',
                    textTransform: 'uppercase',
                  }}
                >
                  Gross Sales
                </span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: '#10756F',
                    background: '#E8F5F4',
                    padding: '2px 7px',
                    borderRadius: 6,
                  }}
                >
                  ₹
                </span>
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#0F172A',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCurrency(summary.grossSales)}
              </div>
              <div style={{ fontSize: 11.5, color: '#64748B', fontWeight: 500, marginTop: 4 }}>
                Total customer order value
              </div>
            </div>

            {/* Card 3: Returns & Refunds (₹) */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #FECACA',
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: '0 1px 3px rgba(220, 38, 38, 0.03)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#991B1B',
                    textTransform: 'uppercase',
                  }}
                >
                  Returns
                </span>
                <span style={{ fontSize: 18 }}>🔄</span>
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: summary.returns > 0 ? '#DC2626' : '#0F172A',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCurrency(summary.returns)}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: summary.returns > 0 ? '#DC2626' : '#64748B',
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                {summary.returns > 0 ? 'Deducted cancellations' : '₹0 return deductions'}
              </div>
            </div>

            {/* Card 4: Net Sales (₹) */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #CCECE8',
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: '0 1px 3px rgba(12, 93, 88, 0.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#5A7572',
                    textTransform: 'uppercase',
                  }}
                >
                  Net Sales
                </span>
                <span style={{ fontSize: 18 }}>📈</span>
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#0F172A',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCurrency(summary.netSales)}
              </div>
              <div style={{ fontSize: 11.5, color: '#0C5D58', fontWeight: 650, marginTop: 4 }}>
                Gross sales − Returns
              </div>
            </div>

            {/* Card 5: Total Ozon Deductions (₹) */}
            <div
              style={{
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: '0 1px 3px rgba(217, 119, 6, 0.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#B45309',
                    textTransform: 'uppercase',
                  }}
                >
                  Ozon Deductions
                </span>
                <span style={{ fontSize: 18 }}>✂️</span>
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#B45309',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCurrency(summary.ozonDeductions)}
              </div>
              <div style={{ fontSize: 11.5, color: '#92400E', fontWeight: 700, marginTop: 4 }}>
                {summary.effectiveDeductionRate}% effective take rate
              </div>
            </div>

            {/* Card 6: Net Seller Payout (₹) */}
            <div
              style={{
                background: '#F0FDF4',
                border: '1px solid #86EFAC',
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: '0 1px 3px rgba(22, 101, 52, 0.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#166534',
                    textTransform: 'uppercase',
                  }}
                >
                  Net Seller Payout
                </span>
                <span style={{ fontSize: 18 }}>💰</span>
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#15803D',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtCurrency(summary.netSellerAmount)}
              </div>
              <div style={{ fontSize: 11.5, color: '#166534', fontWeight: 700, marginTop: 4 }}>
                Estimated seller net balance
              </div>
            </div>
          </div>

          {/* ── 4 INTERACTIVE NAVIGATION TABS (NO THUNDER ICON) ───────── */}
          <div
            className="charges-tabs-bar"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: '2px solid #E2E8F0',
              marginBottom: 16,
              overflowX: 'auto',
            }}
          >
            {[
              { id: 'sales', label: 'Sales Report', count: filteredOrders.length },
              { id: 'unmapped', label: 'Unmapped Charges', count: unmapped.length },
              { id: 'reconciliation', label: 'Charge Reconciliation' },
              { id: 'comparison', label: 'Ozon UI Comparison' },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    fontSize: 13.5,
                    fontWeight: isActive ? 750 : 600,
                    color: isActive ? '#0C5D58' : '#64748B',
                    background: isActive ? '#FFFFFF' : 'transparent',
                    border: 'none',
                    borderBottom: isActive ? '3px solid #10756F' : '3px solid transparent',
                    marginBottom: -2,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span
                      style={{
                        background: isActive ? '#E8F5F4' : '#F1F5F9',
                        color: isActive ? '#0C5D58' : '#64748B',
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 999,
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── TAB 1 : SALES REPORT (ORDERS WITH PAGINATION) ──────────── */}
          {activeTab === 'sales' && (
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #CCECE8',
                borderRadius: 14,
                overflow: 'hidden',
              }}
            >
              {/* Table Header Controls */}
              <div
                style={{
                  padding: '14px 18px',
                  borderBottom: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  background: '#F8FBFA',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ position: 'relative', width: 260 }}>
                    <input
                      type="text"
                      placeholder="Search posting #, product, or SKU…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 12px 0 32px',
                        borderRadius: 8,
                        border: '1px solid #CCECE8',
                        fontSize: 12.5,
                        outline: 'none',
                      }}
                    />
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="#64748B"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ position: 'absolute', left: 10, top: 11 }}
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>

                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                      height: 36,
                      padding: '0 10px',
                      borderRadius: 8,
                      border: '1px solid #CCECE8',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: '#334155',
                      background: '#FFFFFF',
                    }}
                  >
                    <option value="all">All Statuses</option>
                    <option value="delivered">Delivered</option>
                    <option value="awaiting_packaging">Awaiting packaging</option>
                    <option value="returned">Returned</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Selection Counter & Page Size Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {selectedOrderIds.size > 0 && (
                    <>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: '#0C5D58',
                          background: '#E8F5F4',
                          padding: '4px 10px',
                          borderRadius: 6,
                        }}
                      >
                        {selectedOrderIds.size} selected
                      </span>
                      <button
                        type="button"
                        disabled={exporting}
                        onClick={() => handleExportExcel('selected')}
                        className="dash-outline"
                        style={{
                          height: 34,
                          padding: '0 12px',
                          fontSize: 12,
                          opacity: exporting ? 0.6 : 1,
                          cursor: exporting ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {exporting ? 'Exporting…' : 'Export Selected (Excel)'}
                      </button>
                    </>
                  )}

                  {/* Page size dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ color: '#64748B', fontWeight: 600 }}>Show:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      style={{
                        height: 32,
                        padding: '0 6px',
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                      }}
                    >
                      <option value={10}>10 per page</option>
                      <option value={15}>15 per page</option>
                      <option value={25}>25 per page</option>
                      <option value={50}>50 per page</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Sales Report Table */}
              <div
                className="table-wrap orders-table-wrap"
                style={{ margin: 0, border: 'none', borderRadius: 0 }}
              >
                <table className="reports-table" style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: '#F1F5F9' }}>
                      <th style={{ width: 36, textAlign: 'center', padding: '10px 8px' }}>
                        <input
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={
                            filteredOrders.length > 0 &&
                            selectedOrderIds.size === filteredOrders.length
                          }
                          aria-label="Select all orders"
                        />
                      </th>
                      <th style={{ width: 100 }}>Date</th>
                      <th style={{ width: 140 }}>Posting / Order #</th>
                      <th style={{ minWidth: 200 }}>Products & SKU</th>
                      <th style={{ width: 45, textAlign: 'center' }}>Qty</th>
                      <th style={{ width: 90, textAlign: 'right' }}>Order Val (₹)</th>
                      <th style={{ width: 85, textAlign: 'right', color: '#B45309' }}>Comm. (₹)</th>
                      <th style={{ width: 85, textAlign: 'right', color: '#B45309' }}>Logistics (₹)</th>
                      <th style={{ width: 80, textAlign: 'right', color: '#DC2626' }}>Returns (₹)</th>
                      <th style={{ width: 85, textAlign: 'right', color: '#B45309' }}>Services (₹)</th>
                      <th style={{ width: 80, textAlign: 'right', color: '#B45309' }}>Promo (₹)</th>
                      <th style={{ width: 80, textAlign: 'right', color: '#B45309' }}>Other (₹)</th>
                      <th
                        style={{
                          width: 100,
                          textAlign: 'right',
                          fontWeight: 800,
                          color: '#B45309',
                        }}
                      >
                        Total Deduct (₹)
                      </th>
                      <th
                        style={{
                          width: 100,
                          textAlign: 'right',
                          fontWeight: 800,
                          color: '#059669',
                        }}
                      >
                        Net Amount (₹)
                      </th>
                      <th style={{ width: 70, textAlign: 'center' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan="15" style={{ padding: '60px 20px', textAlign: 'center' }}>
                          <strong style={{ color: '#0F172A', fontSize: 14 }}>
                            No orders found for this filter or date range.
                          </strong>
                          <p style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>
                            Change the account or adjust the date range above and click{' '}
                            <strong>Load Charges</strong>.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      paginatedOrders.map((order) => {
                        const isExpanded = expandedRowIds.has(order.id);
                        const isChecked = selectedOrderIds.has(order.id);
                        return (
                          <>
                            <tr
                              key={order.id}
                              style={{
                                background: isChecked
                                  ? '#E8F5F4'
                                  : isExpanded
                                  ? '#F8FBFA'
                                  : '#FFFFFF',
                                transition: 'background 0.12s ease',
                              }}
                            >
                              {/* Checkbox */}
                              <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleSelectOrder(order.id)}
                                  aria-label={`Select order ${order.postingNumber}`}
                                />
                              </td>

                              {/* Date */}
                              <td
                                style={{
                                  whiteSpace: 'nowrap',
                                  fontVariantNumeric: 'tabular-nums',
                                  color: '#475569',
                                }}
                              >
                                {order.date}
                              </td>

                              {/* Posting & Order Numbers */}
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <strong
                                    style={{
                                      color: '#0C5D58',
                                      fontFamily: 'monospace',
                                      fontSize: 12,
                                    }}
                                  >
                                    {order.postingNumber}
                                  </strong>
                                  <span style={{ fontSize: 11, color: '#94A3B8' }}>
                                    #{order.orderNumber}
                                  </span>
                                </div>
                              </td>

                              {/* Products & SKU */}
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <span
                                    style={{
                                      fontWeight: 650,
                                      color: '#1E293B',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      maxWidth: 220,
                                    }}
                                    title={order.products?.[0]?.title}
                                  >
                                    {order.products?.[0]?.title || 'Ozon Item'}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: '#64748B',
                                      fontFamily: 'monospace',
                                    }}
                                  >
                                    SKU: {order.products?.[0]?.sku || order.products?.[0]?.offerId}
                                  </span>
                                </div>
                              </td>

                              {/* Quantity */}
                              <td style={{ textAlign: 'center', fontWeight: 700, color: '#0F172A' }}>
                                {order.quantity}
                              </td>

                              {/* Order Value (Gross) */}
                              <td
                                style={{
                                  textAlign: 'right',
                                  fontWeight: 700,
                                  color: '#0F172A',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {fmtCurrency(order.orderValue)}
                              </td>

                              {/* Commission */}
                              <td
                                style={{
                                  textAlign: 'right',
                                  color: '#B45309',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                −{fmtCurrency(order.commission)}
                              </td>

                              {/* Logistics */}
                              <td
                                style={{
                                  textAlign: 'right',
                                  color: '#B45309',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                −{fmtCurrency(order.logistics)}
                              </td>

                              {/* Returns */}
                              <td
                                style={{
                                  textAlign: 'right',
                                  color: order.returns > 0 ? '#DC2626' : '#94A3B8',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {order.returns > 0 ? `−${fmtCurrency(order.returns)}` : '—'}
                              </td>

                              {/* Partner Services */}
                              <td
                                style={{
                                  textAlign: 'right',
                                  color: '#B45309',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                −{fmtCurrency(order.partnerServices)}
                              </td>

                              {/* Promotion */}
                              <td
                                style={{
                                  textAlign: 'right',
                                  color: '#B45309',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                −{fmtCurrency(order.promotion)}
                              </td>

                              {/* Other Charges */}
                              <td
                                style={{
                                  textAlign: 'right',
                                  color: '#B45309',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                −{fmtCurrency(order.otherCharges)}
                              </td>

                              {/* Total Deductions */}
                              <td
                                style={{
                                  textAlign: 'right',
                                  fontWeight: 800,
                                  color: '#B45309',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                −{fmtCurrency(order.totalDeductions)}
                              </td>

                              {/* Net Amount */}
                              <td
                                style={{
                                  textAlign: 'right',
                                  fontWeight: 800,
                                  color: '#059669',
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                {fmtCurrency(order.netAmount)}
                              </td>

                              {/* Expand Button */}
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => toggleRowExpand(order.id)}
                                  style={{
                                    background: isExpanded ? '#CCECE8' : '#F1F5F9',
                                    border: '1px solid #CCECE8',
                                    borderRadius: 6,
                                    width: 28,
                                    height: 26,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: '#0C5D58',
                                    fontSize: 11,
                                    fontWeight: 800,
                                  }}
                                  title={isExpanded ? 'Collapse breakdown' : 'View fee breakdown'}
                                >
                                  {isExpanded ? '▲' : '▼'}
                                </button>
                              </td>
                            </tr>

                            {/* ── EXPANDED ORDER DETAILS SUB-PANEL ──────────── */}
                            {isExpanded && (
                              <tr key={`${order.id}-expanded`} style={{ background: '#F8FBFA' }}>
                                <td
                                  colSpan="15"
                                  style={{
                                    padding: '14px 20px',
                                    borderBottom: '2px solid #CCECE8',
                                  }}
                                >
                                  <div
                                    style={{
                                      background: '#FFFFFF',
                                      border: '1px solid #CCECE8',
                                      borderRadius: 10,
                                      padding: 16,
                                      boxShadow: '0 1px 4px rgba(16, 117, 111, 0.05)',
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 14,
                                        flexWrap: 'wrap',
                                        gap: 10,
                                      }}
                                    >
                                      <div>
                                        <strong style={{ fontSize: 14, color: '#0F172A' }}>
                                          Itemized Fee Breakdown & Deduction Statement
                                        </strong>
                                        <span
                                          style={{
                                            fontSize: 12,
                                            color: '#64748B',
                                            marginLeft: 10,
                                          }}
                                        >
                                          Posting #{order.postingNumber} &bull; Route:{' '}
                                          {order.clusterFrom} &rarr; {order.clusterTo}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span
                                          style={{
                                            fontSize: 12,
                                            color: '#5A7572',
                                            fontWeight: 600,
                                          }}
                                        >
                                          Customer Price Paid:
                                        </span>
                                        <span
                                          style={{
                                            fontSize: 12.5,
                                            fontWeight: 700,
                                            color: '#0F172A',
                                            background: '#F1F5F9',
                                            padding: '2px 8px',
                                            borderRadius: 4,
                                          }}
                                        >
                                          {order.customerPrice}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Itemized Breakdown Table in ₹ */}
                                    <table
                                      style={{
                                        width: '100%',
                                        borderCollapse: 'collapse',
                                        fontSize: 12,
                                      }}
                                    >
                                      <thead>
                                        <tr
                                          style={{
                                            borderBottom: '1px solid #E2E8F0',
                                            color: '#64748B',
                                            textAlign: 'left',
                                          }}
                                        >
                                          <th style={{ padding: '6px 8px', fontWeight: 700 }}>
                                            Fee Category
                                          </th>
                                          <th style={{ padding: '6px 8px', fontWeight: 700 }}>
                                            Ozon Service Name & Description
                                          </th>
                                          <th style={{ padding: '6px 8px', fontWeight: 700 }}>
                                            Service Code
                                          </th>
                                          <th style={{ padding: '6px 8px', fontWeight: 700 }}>
                                            Tariff Rate
                                          </th>
                                          <th
                                            style={{
                                              padding: '6px 8px',
                                              fontWeight: 700,
                                              textAlign: 'right',
                                            }}
                                          >
                                            Amount (₹)
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {order.itemizedBreakdown?.map((item, idx) => (
                                          <tr
                                            key={idx}
                                            style={{ borderBottom: '1px solid #F1F5F9' }}
                                          >
                                            <td
                                              style={{
                                                padding: '6px 8px',
                                                fontWeight: 650,
                                                color: '#0C5D58',
                                              }}
                                            >
                                              {item.category}
                                            </td>
                                            <td style={{ padding: '6px 8px', color: '#1E293B' }}>
                                              {item.name}
                                            </td>
                                            <td
                                              style={{
                                                padding: '6px 8px',
                                                color: '#64748B',
                                                fontFamily: 'monospace',
                                                fontSize: 11,
                                              }}
                                            >
                                              {item.code}
                                            </td>
                                            <td style={{ padding: '6px 8px', color: '#475569' }}>
                                              {item.rate}
                                            </td>
                                            <td
                                              style={{
                                                padding: '6px 8px',
                                                textAlign: 'right',
                                                fontWeight: 700,
                                                color: item.amount < 0 ? '#DC2626' : '#B45309',
                                                fontVariantNumeric: 'tabular-nums',
                                              }}
                                            >
                                              {item.amount < 0
                                                ? `−${fmtCurrency(Math.abs(item.amount))}`
                                                : `−${fmtCurrency(item.amount)}`}
                                            </td>
                                          </tr>
                                        ))}
                                        <tr style={{ background: '#F8FBFA', fontWeight: 800 }}>
                                          <td
                                            colSpan="4"
                                            style={{
                                              padding: '8px',
                                              textAlign: 'right',
                                              color: '#0F172A',
                                            }}
                                          >
                                            Total Deductions for Posting:
                                          </td>
                                          <td
                                            style={{
                                              padding: '8px',
                                              textAlign: 'right',
                                              color: '#B45309',
                                              fontSize: 13,
                                              fontVariantNumeric: 'tabular-nums',
                                            }}
                                          >
                                            −{fmtCurrency(order.totalDeductions)}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>

                                    {/* Return Details Banner if Returned */}
                                    {order.returnDetails && (
                                      <div
                                        style={{
                                          marginTop: 12,
                                          padding: '10px 14px',
                                          background: '#FEF2F2',
                                          border: '1px solid #FECACA',
                                          borderRadius: 8,
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 12,
                                          fontSize: 12,
                                          color: '#991B1B',
                                        }}
                                      >
                                        <span style={{ fontSize: 16 }}>⚠️</span>
                                        <div>
                                          <strong>Return/Refund Information:</strong>{' '}
                                          {order.returnDetails.reason} (Processed:{' '}
                                          {order.returnDetails.returnDate}) &bull; Restock Status:{' '}
                                          <em>{order.returnDetails.restockStatus}</em>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── PAGINATION BAR ────────────────────────────────────── */}
              {filteredOrders.length > 0 && (
                <div
                  style={{
                    padding: '12px 18px',
                    borderTop: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    background: '#FAFDFD',
                  }}
                >
                  <div style={{ fontSize: 12.5, color: '#64748B' }}>
                    Showing{' '}
                    <strong style={{ color: '#0F172A' }}>
                      {(currentPage - 1) * pageSize + 1}
                    </strong>{' '}
                    to{' '}
                    <strong style={{ color: '#0F172A' }}>
                      {Math.min(currentPage * pageSize, filteredOrders.length)}
                    </strong>{' '}
                    of <strong style={{ color: '#0F172A' }}>{filteredOrders.length}</strong> orders
                  </div>

                  {/* Page Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      className="charges-page-btn"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(1)}
                      title="First Page"
                    >
                      &laquo;
                    </button>
                    <button
                      type="button"
                      className="charges-page-btn"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      title="Previous Page"
                    >
                      &lsaquo; Prev
                    </button>

                    {/* Page numbers */}
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .map((p, idx, arr) => {
                        const prevP = arr[idx - 1];
                        const hasGap = prevP && p - prevP > 1;
                        return (
                          <span
                            key={p}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            {hasGap && (
                              <span style={{ color: '#94A3B8', padding: '0 3px' }}>&hellip;</span>
                            )}
                            <button
                              type="button"
                              className={`charges-page-btn ${currentPage === p ? 'active' : ''}`}
                              onClick={() => setCurrentPage(p)}
                            >
                              {p}
                            </button>
                          </span>
                        );
                      })}

                    <button
                      type="button"
                      className="charges-page-btn"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      title="Next Page"
                    >
                      Next &rsaquo;
                    </button>
                    <button
                      type="button"
                      className="charges-page-btn"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                      title="Last Page"
                    >
                      &raquo;
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAB 2 : UNMAPPED OR SELLER-LEVEL CHARGES ──────────────── */}
          {activeTab === 'unmapped' && (
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #CCECE8',
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Unmapped & Seller-Level Platform Deductions
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
                  These transactions are debited directly from your Ozon seller balance rather than
                  tied to an individual order (e.g. store subscriptions, brand advertising, penalty
                  fines, warehouse handling). All amounts shown in ₹ (INR).
                </p>
              </div>

              <table className="reports-table" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#F1F5F9' }}>
                    <th style={{ width: 110 }}>Date</th>
                    <th style={{ width: 160 }}>Category</th>
                    <th style={{ minWidth: 220 }}>Charge Description</th>
                    <th style={{ width: 140 }}>Reference ID</th>
                    <th style={{ minWidth: 220 }}>Reason Not Mapped</th>
                    <th style={{ width: 110, textAlign: 'right' }}>Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {unmapped.length === 0 ? (
                    <tr>
                      <td
                        colSpan="6"
                        style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}
                      >
                        No unmapped charges found for this period.
                      </td>
                    </tr>
                  ) : (
                    unmapped.map((item) => (
                      <tr key={item.id}>
                        <td style={{ color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                          {item.date}
                        </td>
                        <td>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 700,
                              background: '#E8F5F4',
                              color: '#0C5D58',
                              border: '1px solid #B2E0DC',
                            }}
                          >
                            {item.category}
                          </span>
                        </td>
                        <td style={{ fontWeight: 650, color: '#1E293B' }}>{item.title}</td>
                        <td
                          style={{
                            fontFamily: 'monospace',
                            color: '#64748B',
                            fontSize: 11.5,
                          }}
                        >
                          {item.referenceId}
                        </td>
                        <td style={{ color: '#64748B' }}>{item.reason}</td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontWeight: 800,
                            color: '#B45309',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          −{fmtCurrency(item.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                  {unmapped.length > 0 && (
                    <tr style={{ background: '#F8FBFA', fontWeight: 800 }}>
                      <td
                        colSpan="5"
                        style={{
                          textAlign: 'right',
                          padding: '12px 14px',
                          color: '#0F172A',
                        }}
                      >
                        Total Unmapped Platform Deductions:
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '12px 14px',
                          color: '#B45309',
                          fontSize: 14,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        −{fmtCurrency(summary.unmappedDeductions)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── TAB 3 : CHARGE RECONCILIATION & BREAKDOWN ─────────────── */}
          {activeTab === 'reconciliation' && (
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #CCECE8',
                borderRadius: 14,
                padding: 20,
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Charge Reconciliation by Category
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
                  Category totals split into order-mapped amounts and seller-level unmapped amounts to
                  give complete visibility into Ozon deductions (all values in ₹ INR).
                </p>
              </div>

              <table className="reports-table" style={{ fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F1F5F9' }}>
                    <th style={{ minWidth: 200 }}>Category</th>
                    <th style={{ width: 150, textAlign: 'right' }}>Mapped to Orders (₹)</th>
                    <th style={{ width: 150, textAlign: 'right' }}>Unmapped / Seller (₹)</th>
                    <th style={{ width: 150, textAlign: 'right' }}>Total Deductions (₹)</th>
                    <th style={{ width: 90, textAlign: 'right' }}>Share %</th>
                    <th style={{ width: 180 }}>Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliation.map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700, color: '#0F172A' }}>{row.category}</td>
                      <td
                        style={{
                          textAlign: 'right',
                          color: '#0C5D58',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmtCurrency(row.mappedAmount)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          color: '#B45309',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmtCurrency(row.unmappedAmount)}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 800,
                          color: '#B45309',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmtCurrency(row.totalAmount)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#475569' }}>
                        {row.percentage}%
                      </td>
                      <td>
                        <div
                          style={{
                            width: '100%',
                            height: 8,
                            background: '#E2E8F0',
                            borderRadius: 999,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(0, parseFloat(row.percentage) || 0)
                              )}%`,
                              height: '100%',
                              background: '#10756F',
                              borderRadius: 999,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: '#F8FBFA', fontWeight: 800 }}>
                    <td style={{ padding: '12px 14px' }}>Aggregated Totals</td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '12px 14px',
                        color: '#0C5D58',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCurrency(summary.mappedDeductions)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '12px 14px',
                        color: '#B45309',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCurrency(summary.unmappedDeductions)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        padding: '12px 14px',
                        color: '#B45309',
                        fontSize: 14,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCurrency(summary.ozonDeductions)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 14px' }}>100.0%</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── TAB 4 : OZON UI COMPARISON TOOL (RUPEES ₹) ────────────── */}
          {activeTab === 'comparison' && (
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #CCECE8',
                borderRadius: 14,
                padding: 22,
              }}
            >
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  Ozon Seller UI Figure Comparison & Spot-Check
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
                  Enter the figures shown in your Ozon Seller web portal (in ₹) for this date range to
                  spot-check against the API calculated totals. These manual inputs are for
                  discrepancy checking only and do not alter the API data.
                </p>
              </div>

              {/* Input Row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 16,
                  background: '#F8FBFA',
                  border: '1px solid #CCECE8',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 24,
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#0C5D58',
                      marginBottom: 6,
                    }}
                  >
                    Ozon UI Gross Sales (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 81500.00"
                    value={manualGross}
                    onChange={(e) => setManualGross(e.target.value)}
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 10px',
                      borderRadius: 8,
                      border: '1px solid #CCECE8',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#0C5D58',
                      marginBottom: 6,
                    }}
                  >
                    Ozon UI Total Deductions (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 24800.00"
                    value={manualDeductions}
                    onChange={(e) => setManualDeductions(e.target.value)}
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 10px',
                      borderRadius: 8,
                      border: '1px solid #CCECE8',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#0C5D58',
                      marginBottom: 6,
                    }}
                  >
                    Ozon UI Net Payout (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 56700.00"
                    value={manualNet}
                    onChange={(e) => setManualNet(e.target.value)}
                    style={{
                      width: '100%',
                      height: 38,
                      padding: '0 10px',
                      borderRadius: 8,
                      border: '1px solid #CCECE8',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  />
                </div>
              </div>

              {/* Comparison Delta Table */}
              <table className="reports-table" style={{ fontSize: 13, marginBottom: 16 }}>
                <thead>
                  <tr style={{ background: '#F1F5F9' }}>
                    <th style={{ width: '25%' }}>Financial Metric</th>
                    <th style={{ width: '25%', textAlign: 'right' }}>API Calculated Total (₹)</th>
                    <th style={{ width: '25%', textAlign: 'right' }}>Ozon Seller UI Input (₹)</th>
                    <th style={{ width: '25%', textAlign: 'right' }}>Difference (Δ Delta)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Gross Sales */}
                  <tr>
                    <td style={{ fontWeight: 700, color: '#0F172A' }}>Gross Sales</td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 650,
                        color: '#0F172A',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCurrency(summary.grossSales)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: '#475569',
                      }}
                    >
                      {!isNaN(comparisonCalculations.mGross)
                        ? fmtCurrency(comparisonCalculations.mGross)
                        : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {comparisonCalculations.grossDelta !== null ? (
                        <span
                          style={{
                            fontWeight: 800,
                            color:
                              Math.abs(comparisonCalculations.grossDelta) < 5
                                ? '#059669'
                                : '#DC2626',
                          }}
                        >
                          {comparisonCalculations.grossDelta > 0
                            ? `+${fmtCurrency(comparisonCalculations.grossDelta)}`
                            : fmtCurrency(comparisonCalculations.grossDelta)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>

                  {/* Total Deductions */}
                  <tr>
                    <td style={{ fontWeight: 700, color: '#0F172A' }}>Total Ozon Deductions</td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 650,
                        color: '#B45309',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCurrency(summary.ozonDeductions)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: '#475569',
                      }}
                    >
                      {!isNaN(comparisonCalculations.mDeduct)
                        ? fmtCurrency(comparisonCalculations.mDeduct)
                        : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {comparisonCalculations.deductDelta !== null ? (
                        <span
                          style={{
                            fontWeight: 800,
                            color:
                              Math.abs(comparisonCalculations.deductDelta) < 5
                                ? '#059669'
                                : '#DC2626',
                          }}
                        >
                          {comparisonCalculations.deductDelta > 0
                            ? `+${fmtCurrency(comparisonCalculations.deductDelta)}`
                            : fmtCurrency(comparisonCalculations.deductDelta)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>

                  {/* Net Payout */}
                  <tr style={{ background: '#F8FBFA' }}>
                    <td style={{ fontWeight: 800, color: '#059669' }}>Net Seller Payout</td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 800,
                        color: '#059669',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {fmtCurrency(summary.netSellerAmount)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: '#475569',
                        fontWeight: 700,
                      }}
                    >
                      {!isNaN(comparisonCalculations.mNet)
                        ? fmtCurrency(comparisonCalculations.mNet)
                        : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {comparisonCalculations.netDelta !== null ? (
                        <span
                          style={{
                            fontWeight: 800,
                            color:
                              Math.abs(comparisonCalculations.netDelta) < 5
                                ? '#059669'
                                : '#DC2626',
                          }}
                        >
                          {comparisonCalculations.netDelta > 0
                            ? `+${fmtCurrency(comparisonCalculations.netDelta)}`
                            : fmtCurrency(comparisonCalculations.netDelta)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Comparison Status Alert */}
              {comparisonCalculations.hasAnyInput && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    background: comparisonCalculations.perfectMatch ? '#ECFDF5' : '#FFFBEB',
                    border: `1px solid ${
                      comparisonCalculations.perfectMatch ? '#A7F3D0' : '#FDE68A'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 18 }}>
                    {comparisonCalculations.perfectMatch ? '✅' : '⚠️'}
                  </span>
                  <div
                    style={{
                      fontSize: 13,
                      color: comparisonCalculations.perfectMatch ? '#065F46' : '#92400E',
                    }}
                  >
                    {comparisonCalculations.perfectMatch ? (
                      <strong>
                        Perfect Reconciliation! Your Ozon Seller UI totals match the API deductions
                        closely.
                      </strong>
                    ) : (
                      <div>
                        <strong>Discrepancy detected:</strong> The API totals differ from the manual
                        Ozon UI input. Check the <strong>Unmapped Charges</strong> tab or pending
                        transaction adjustments.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
