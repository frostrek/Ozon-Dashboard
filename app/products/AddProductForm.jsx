'use client';

import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import TypeSelect from '../components/TypeSelect';

const EMPTY = {
  accountId: '',
  name: '',
  sku: '',
  price: '',
  oldPrice: '',
  currency: 'RUB',
  vat: '0.2',
  categoryId: '',
  typeId: '',
  images: '',
  weight: '',
  depth: '',
  width: '',
  height: '',
  brand: '',
  barcode: '',
  description: '',
  isVariant: false,
  parentProductId: '',
  modelName: '',
  variantValue: '',
};

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value) || fallback;
  } catch {
    return fallback;
  }
}

export default function AddProductForm({ accounts, onClose, existingProducts = [], initialParentProduct = null }) {
  const router = useRouter();
  const [isVariant, setIsVariant] = useState(Boolean(initialParentProduct));
  const [parentProductId, setParentProductId] = useState(initialParentProduct?.id || '');

  const [values, setValues] = useState(() => {
    const base = {
      ...EMPTY,
      accountId: initialParentProduct?.account_id || accounts[0]?.id || '',
      isVariant: Boolean(initialParentProduct),
      parentProductId: initialParentProduct?.id || '',
    };
    if (initialParentProduct) {
      const attrs = parseJson(initialParentProduct.attributes_json, {});
      const images = parseJson(initialParentProduct.images_json, []);
      base.brand = initialParentProduct.brand || '';
      base.modelName = initialParentProduct.name || '';
      base.categoryId = attrs.description_category_id || '';
      base.typeId = attrs.type_id || '';
      base.vat = attrs.vat || '0.2';
      base.description = attrs.description || '';
      base.currency = initialParentProduct.currency || 'RUB';
      base.images = Array.isArray(images) ? images.join('\n') : '';
    }
    return base;
  });

  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  // Products belonging to the currently selected account
  const accountProducts = useMemo(() => {
    return (existingProducts || []).filter((p) => !values.accountId || p.account_id === values.accountId);
  }, [existingProducts, values.accountId]);

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function handleParentProductSelect(selectedId) {
    setParentProductId(selectedId);
    setField('parentProductId', selectedId);
    if (!selectedId) return;

    const parent = accountProducts.find((p) => p.id === selectedId);
    if (parent) {
      const attrs = parseJson(parent.attributes_json, {});
      const images = parseJson(parent.images_json, []);
      setValues((current) => ({
        ...current,
        parentProductId: selectedId,
        brand: current.brand || parent.brand || '',
        modelName: parent.name || '',
        categoryId: attrs.description_category_id || current.categoryId,
        typeId: attrs.type_id || current.typeId,
        vat: attrs.vat != null ? String(attrs.vat) : current.vat,
        description: current.description || attrs.description || '',
        currency: parent.currency || current.currency,
        images: current.images || (Array.isArray(images) ? images.join('\n') : ''),
        name: current.variantValue ? `${parent.name} ${current.variantValue}` : current.name || parent.name,
      }));
    }
  }

  function handleVariantValueChange(val) {
    setField('variantValue', val);
    if (values.modelName && val) {
      setField('name', `${values.modelName} ${val}`);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    setSaved('');
    try {
      const payload = {
        ...values,
        isVariant,
        parentProductId: isVariant ? parentProductId : '',
        modelName: values.modelName || (isVariant ? values.name : ''),
        modelGroupName: values.modelName || (isVariant ? values.name : ''),
      };
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ozon did not accept this product.');
      setSaved(`Ozon accepted the product. Import task ${data.taskId}.`);
      router.refresh();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="confirm-backdrop" onClick={() => { if (!pending) onClose(); }}>
      <form className="confirm-card prod-add" onClick={(event) => event.stopPropagation()} onSubmit={submit} style={{ maxWidth: '680px' }}>
        <h2>{isVariant ? 'Add Product Variant' : 'Add product to Ozon'}</h2>
        <p>
          {isVariant
            ? 'Adds a new size, weight, or color variant linked to an existing product card on Ozon.'
            : 'Sends this product to the selected seller account with the Ozon import API.'}
        </p>

        {/* Variant toggle box */}
        <div style={{
          background: isVariant ? '#EFF6FF' : '#F8FAFC',
          border: `1px solid ${isVariant ? '#BFDBFE' : '#E2E8F0'}`,
          borderRadius: '8px',
          padding: '12px 14px',
          marginBottom: '14px',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
            <input
              type="checkbox"
              checked={isVariant}
              onChange={(e) => {
                const next = e.target.checked;
                setIsVariant(next);
                setField('isVariant', next);
                if (!next) {
                  setParentProductId('');
                  setField('parentProductId', '');
                }
              }}
            />
            <span>This product is a variant (different weight, size, shade, or pack)</span>
          </label>

          {isVariant && (
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                <span className="field-label">Link to existing product (Optional)</span>
                <select
                  value={parentProductId}
                  onChange={(e) => handleParentProductSelect(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    background: '#fff',
                    fontSize: '13px',
                  }}
                >
                  <option value="">-- Choose existing product or enter model name below --</option>
                  {accountProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.sku} ({p.sku})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field-label">Base Product / Model Name</span>
                <input
                  value={values.modelName}
                  onChange={(e) => setField('modelName', e.target.value)}
                  placeholder="e.g. Minimalist Face Wash"
                  required={isVariant}
                />
              </label>

              <label className="field">
                <span className="field-label">Variant Value (Weight / Size)</span>
                <input
                  value={values.variantValue}
                  onChange={(e) => handleVariantValueChange(e.target.value)}
                  placeholder="e.g. 250 g or 100 g"
                />
              </label>
            </div>
          )}
        </div>

        <div className="prod-add-grid">
          <label className="field">
            <span className="field-label">Account</span>
            <TypeSelect
              label="Account"
              value={values.accountId}
              options={accounts.length === 0 ? [{ id: '', label: 'No accounts yet' }] : accounts.map((account) => ({ id: account.id, label: account.name }))}
              onChange={(next) => setField('accountId', next)}
            />
          </label>
          <label className="field">
            <span className="field-label">SKU / offer id</span>
            <input value={values.sku} onChange={(event) => setField('sku', event.target.value)} placeholder="SKU-1001-250G" required />
          </label>
          <label className="field prod-add-wide">
            <span className="field-label">Product name (Displayed title)</span>
            <input
              value={values.name}
              onChange={(event) => setField('name', event.target.value)}
              placeholder="Minimalist Face Wash 250 g"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Price</span>
            <input value={values.price} onChange={(event) => setField('price', event.target.value)} inputMode="decimal" placeholder="1990" required />
          </label>
          <label className="field">
            <span className="field-label">Old price</span>
            <input value={values.oldPrice} onChange={(event) => setField('oldPrice', event.target.value)} inputMode="decimal" placeholder="2490" />
          </label>
          <label className="field">
            <span className="field-label">Currency</span>
            <TypeSelect
              label="Currency"
              value={values.currency}
              options={[{ id: 'RUB', label: 'RUB' }, { id: 'USD', label: 'USD' }, { id: 'INR', label: 'INR' }]}
              onChange={(next) => setField('currency', next)}
            />
          </label>
          <label className="field">
            <span className="field-label">VAT</span>
            <input value={values.vat} onChange={(event) => setField('vat', event.target.value)} placeholder="0.2" required />
          </label>
          <label className="field">
            <span className="field-label">Category ID</span>
            <input value={values.categoryId} onChange={(event) => setField('categoryId', event.target.value)} inputMode="numeric" placeholder="17028922" required />
          </label>
          <label className="field">
            <span className="field-label">Type ID</span>
            <input value={values.typeId} onChange={(event) => setField('typeId', event.target.value)} inputMode="numeric" placeholder="93080" required />
          </label>
          <label className="field">
            <span className="field-label">Brand</span>
            <input value={values.brand} onChange={(event) => setField('brand', event.target.value)} placeholder="Minimalist" />
          </label>
          <label className="field">
            <span className="field-label">Barcode</span>
            <input value={values.barcode} onChange={(event) => setField('barcode', event.target.value)} placeholder="4601234567890" />
          </label>
          <label className="field">
            <span className="field-label">Weight (g)</span>
            <input value={values.weight} onChange={(event) => setField('weight', event.target.value)} inputMode="decimal" placeholder="250" required />
          </label>
          <label className="field">
            <span className="field-label">Depth (mm)</span>
            <input value={values.depth} onChange={(event) => setField('depth', event.target.value)} inputMode="decimal" placeholder="200" required />
          </label>
          <label className="field">
            <span className="field-label">Width (mm)</span>
            <input value={values.width} onChange={(event) => setField('width', event.target.value)} inputMode="decimal" placeholder="150" required />
          </label>
          <label className="field">
            <span className="field-label">Height (mm)</span>
            <input value={values.height} onChange={(event) => setField('height', event.target.value)} inputMode="decimal" placeholder="40" required />
          </label>
          <label className="field prod-add-wide">
            <span className="field-label">Description</span>
            <textarea value={values.description || ''} onChange={(event) => setField('description', event.target.value)} placeholder="Gentle face cleanser with soothing oat extract..." />
          </label>
          <label className="field prod-add-wide">
            <span className="field-label">Image URLs</span>
            <textarea value={values.images} onChange={(event) => setField('images', event.target.value)} placeholder="https://example.com/photo.jpg" required />
          </label>
        </div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {saved && <p className="notice notice-ok" role="status">{saved}</p>}
        <div className="confirm-actions">
          <button type="button" className="dash-outline" onClick={onClose} disabled={pending}>Cancel</button>
          <button type="submit" className="dash-primary" disabled={pending || accounts.length === 0}>
            {pending ? 'Sending...' : (isVariant ? 'Add Variant to Ozon' : 'Add to Ozon')}
          </button>
        </div>
      </form>
    </div>
  );
}
