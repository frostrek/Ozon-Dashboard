'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const EMPTY = {
  accountId: '',
  name: '',
  sku: '',
  price: '',
  oldPrice: '',
  currency: 'RUB',
  vat: '',
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
};

export default function AddProductForm({ accounts, onClose }) {
  const router = useRouter();
  const [values, setValues] = useState({
    ...EMPTY,
    accountId: accounts[0]?.id || '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError('');
    setSaved('');
    try {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ozon did not accept this product.');
      setSaved(`Ozon accepted the product. Import task ${data.taskId}.`);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="confirm-backdrop" onClick={() => { if (!pending) onClose(); }}>
      <form className="confirm-card prod-add" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <h2>Add product to Ozon</h2>
        <p>Sends this product to the selected seller account with the Ozon import API.</p>
        <div className="prod-add-grid">
          <label className="field">
            <span className="field-label">Account</span>
            <select value={values.accountId} onChange={(event) => setField('accountId', event.target.value)} required>
              {accounts.length === 0 && <option value="">No accounts yet</option>}
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">SKU / offer id</span>
            <input value={values.sku} onChange={(event) => setField('sku', event.target.value)} placeholder="SKU-1001" required />
          </label>
          <label className="field prod-add-wide">
            <span className="field-label">Product name</span>
            <input value={values.name} onChange={(event) => setField('name', event.target.value)} placeholder="Cotton t-shirt, black, size M" required />
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
            <select value={values.currency} onChange={(event) => setField('currency', event.target.value)}>
              <option value="RUB">RUB</option>
              <option value="USD">USD</option>
              <option value="INR">INR</option>
            </select>
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
            <input value={values.brand} onChange={(event) => setField('brand', event.target.value)} placeholder="Brand name" />
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
            <textarea value={values.description || ''} onChange={(event) => setField('description', event.target.value)} placeholder="Soft cotton t-shirt" />
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
            {pending ? 'Sending...' : 'Add to Ozon'}
          </button>
        </div>
      </form>
    </div>
  );
}
