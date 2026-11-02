'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ToastStack, { useToasts } from '../../../ToastStack';

function Field({ label, children, wide }) {
  return (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8 }}>{label}</label>
      {children}
    </div>
  );
}

function inputStyle() {
  return {
    width: '100%',
    padding: 12,
    borderRadius: 10,
    border: '1px solid #E2E8F0',
    fontSize: 14,
    outline: 'none',
    background: '#fff',
  };
}

export default function EditClient({ product, account, initialForm, loadWarning }) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [form, setForm] = useState(initialForm);

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  const missing = useMemo(() => {
    const gaps = [];
    if (!String(form.sku || '').trim()) gaps.push('SKU');
    if (!String(form.name || '').trim()) gaps.push('name');
    if (form.price === '' || form.price == null || Number.isNaN(Number(form.price))) gaps.push('price');
    if (!String(form.description_category_id || '').trim()) gaps.push('category ID');
    if (!String(form.type_id || '').trim()) gaps.push('type ID');
    if (!String(form.images || '').split(/\s+/).some((url) => /^https:\/\//i.test(url))) gaps.push('https image');
    if (form.vat === '' || form.vat == null) gaps.push('VAT');
    if (form.weight === '' || form.weight == null || Number.isNaN(Number(form.weight))) gaps.push('weight');
    if ([form.depth, form.width, form.height].some((value) => value === '' || value == null || Number.isNaN(Number(value)))) {
      gaps.push('depth, width, and height');
    }
    return gaps;
  }, [form]);

  useEffect(() => {
    if (loadWarning) push(loadWarning, 'error');
    else if (!missing.length) push('All required Ozon fields are present. You can edit them here and push the update.');
  }, []);

  const handleSave = async (pushToOzon = false) => {
    if (saving || pushing) return;
    if (pushToOzon && missing.length) {
      push(`This product cannot be sent to Ozon yet. Missing: ${missing.join(', ')}.`, 'error');
      return;
    }
    if (pushToOzon) setPushing(true);
    else setSaving(true);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, pushToOzon }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        push(data.error || (pushToOzon
          ? 'The listing was saved here, but Ozon did not accept the update.'
          : 'The listing could not be saved.'), 'error');
        return;
      }
      if (pushToOzon) {
        const task = data.taskId ? ` Ozon task ${data.taskId}.` : '';
        push(`Saved and sent to Ozon.${task} Price on Ozon was updated.`);
        if (data.warning) push(data.warning, 'error');
      } else {
        push('Draft saved on this dashboard. Click Save and push to Ozon to send it to the seller account.');
      }
    } catch {
      push('The listing could not be saved.', 'error');
    } finally {
      setSaving(false);
      setPushing(false);
    }
  };

  const images = String(form.images || '').split(/\s+/).map((url) => url.trim()).filter((url) => /^https:\/\//i.test(url));

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <button type="button" className="button-secondary" onClick={() => router.back()}>Back</button>
          <header className="page-head" style={{ marginTop: 12, marginBottom: 0 }}>
            <h1>Edit listing</h1>
            <p className="page-lead">{account?.name} · SKU {form.sku || product.sku} · Ozon ID {product.ozon_id}</p>
          </header>
        </div>
        <div className="toolbar">
          <button type="button" className="button-secondary" onClick={() => handleSave(false)} disabled={saving || pushing}>
            {saving ? 'Saving...' : 'Save draft'}
          </button>
          <button type="button" onClick={() => handleSave(true)} disabled={saving || pushing}>
            {pushing ? 'Sending to Ozon...' : 'Save and push to Ozon'}
          </button>
        </div>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24, color: '#1E293B' }}>Basic Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <Field label="PRODUCT TITLE" wide>
                <input style={inputStyle()} value={form.name} onChange={(e) => setField('name', e.target.value)} />
              </Field>
              <Field label="SKU / OFFER ID">
                <input style={inputStyle()} value={form.sku} onChange={(e) => setField('sku', e.target.value)} />
              </Field>
              <Field label="BARCODE">
                <input style={inputStyle()} value={form.barcode} onChange={(e) => setField('barcode', e.target.value)} />
              </Field>
              <Field label="BRAND">
                <input style={inputStyle()} value={form.brand} onChange={(e) => setField('brand', e.target.value)} />
              </Field>
              <Field label="COLOR / VARIANT">
                <input style={inputStyle()} value={form.color} onChange={(e) => setField('color', e.target.value)} />
              </Field>
              <Field label="SIZE">
                <input style={inputStyle()} value={form.size} onChange={(e) => setField('size', e.target.value)} />
              </Field>
              <Field label="DESCRIPTION" wide>
                <textarea rows={6} style={{ ...inputStyle(), resize: 'vertical' }} value={form.description} onChange={(e) => setField('description', e.target.value)} />
              </Field>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24, color: '#1E293B' }}>Pricing & Inventory</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
              <Field label="MAIN PRICE">
                <input type="number" style={inputStyle()} value={form.price} onChange={(e) => setField('price', e.target.value)} />
              </Field>
              <Field label="OLD PRICE (STRIKE)">
                <input type="number" style={inputStyle()} value={form.old_price} onChange={(e) => setField('old_price', e.target.value)} />
              </Field>
              <Field label="FBS STOCK">
                <input type="number" style={inputStyle()} value={form.stock} onChange={(e) => setField('stock', e.target.value)} />
              </Field>
              <Field label="CURRENCY">
                <input style={inputStyle()} value={form.currency} onChange={(e) => setField('currency', e.target.value)} />
              </Field>
              <Field label="VAT (e.g. 0 or 0.2)">
                <input style={inputStyle()} value={form.vat} onChange={(e) => setField('vat', e.target.value)} placeholder="0" />
              </Field>
              <Field label="WAREHOUSE ID">
                <input style={inputStyle()} value={form.warehouse_id} onChange={(e) => setField('warehouse_id', e.target.value)} />
              </Field>
              <Field label="WAREHOUSE">
                <input style={inputStyle()} value={form.warehouse_name} onChange={(e) => setField('warehouse_name', e.target.value)} />
              </Field>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24, color: '#1E293B' }}>Ozon category & package</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
              <Field label="CATEGORY ID">
                <input style={inputStyle()} value={form.description_category_id} onChange={(e) => setField('description_category_id', e.target.value)} />
              </Field>
              <Field label="TYPE ID">
                <input style={inputStyle()} value={form.type_id} onChange={(e) => setField('type_id', e.target.value)} />
              </Field>
              <Field label="WEIGHT (g)">
                <input type="number" style={inputStyle()} value={form.weight} onChange={(e) => setField('weight', e.target.value)} />
              </Field>
              <Field label="DEPTH (mm)">
                <input type="number" style={inputStyle()} value={form.depth} onChange={(e) => setField('depth', e.target.value)} />
              </Field>
              <Field label="WIDTH (mm)">
                <input type="number" style={inputStyle()} value={form.width} onChange={(e) => setField('width', e.target.value)} />
              </Field>
              <Field label="HEIGHT (mm)">
                <input type="number" style={inputStyle()} value={form.height} onChange={(e) => setField('height', e.target.value)} />
              </Field>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24, color: '#1E293B' }}>Search & Discoverability</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Field label="KEYWORDS (COMMA SEPARATED)">
                <textarea style={inputStyle()} value={form.keywords} onChange={(e) => setField('keywords', e.target.value)} />
              </Field>
              <Field label="HASHTAGS">
                <input style={inputStyle()} value={form.hashtags} onChange={(e) => setField('hashtags', e.target.value)} />
              </Field>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#1E293B' }}>Media Gallery</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
              {images.map((img, i) => (
                <div key={`${img}-${i}`} style={{ position: 'relative', paddingTop: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid #F1F5F9' }}>
                  <img src={img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  {i === 0 && <div style={{ position: 'absolute', bottom: 0, width: '100%', background: '#2563EB', color: '#fff', textAlign: 'center', fontSize: 10, padding: 4, fontWeight: 700 }}>PRIMARY</div>}
                </div>
              ))}
            </div>
            <Field label="IMAGE URLS (ONE PER LINE)">
              <textarea rows={6} style={{ ...inputStyle(), resize: 'vertical', fontSize: 12 }} value={form.images} onChange={(e) => setField('images', e.target.value)} />
            </Field>
          </div>

          <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#1E293B' }}>Listing status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Ozon status</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{product.status_name || product.status || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Model ID</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{product.variant_group_id || 'Standalone'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Created on Ozon</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{product.ozon_created_at ? new Date(product.ozon_created_at).toLocaleDateString('en-GB') : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>FBO stock</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{product.fbo_stock ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Reserved</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{product.reserved_stock ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Warehouse</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{form.warehouse_name || form.warehouse_id || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
