'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ToastStack, { useToasts } from '../../../ToastStack';

function Field({ label, children, wide, info }) {
  return (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#64748B' }}>{label}</label>
        {info}
      </div>
      {children}
    </div>
  );
}

function inputStyle() {
  return {
    width: '100%',
    padding: 12,
    borderRadius: 10,
    border: '1px solid #CCECE8',
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

  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [showRawUrls, setShowRawUrls] = useState(false);

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  // Parse images into array
  const images = useMemo(() => {
    return String(form.images || '')
      .split(/[\s,]+/)
      .map((url) => url.trim())
      .filter((url) => /^https?:\/\//i.test(url) || url.startsWith('data:image/') || url.startsWith('/uploads/'));
  }, [form.images]);

  function updateImages(newList) {
    setField('images', newList.join('\n'));
  }

  function handleSetPrimary(index) {
    if (index === 0) return;
    const item = images[index];
    const rest = images.filter((_, i) => i !== index);
    updateImages([item, ...rest]);
    push('Set as primary image.');
  }

  function handleMove(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= images.length) return;
    const nextList = [...images];
    const temp = nextList[index];
    nextList[index] = nextList[targetIndex];
    nextList[targetIndex] = temp;
    updateImages(nextList);
  }

  function handleDeleteImage(index) {
    const nextList = images.filter((_, i) => i !== index);
    updateImages(nextList);
    push('Image removed.');
  }

  function handleAddImageUrl() {
    const trimmed = newImageUrl.trim();
    if (!trimmed) return;
    if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('/')) {
      push('Please provide a valid image URL starting with http:// or https://', 'error');
      return;
    }
    updateImages([...images, trimmed]);
    setNewImageUrl('');
    push('Image added to gallery.');
  }

  async function handleFileUpload(files) {
    if (!files || !files.length) return;
    setIsUploading(true);
    const addedUrls = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.url) {
          addedUrls.push(data.url);
        } else {
          // Fallback to data URL
          const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
          });
          if (dataUrl) addedUrls.push(dataUrl);
        }
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }

    if (addedUrls.length) {
      updateImages([...images, ...addedUrls]);
      push(`Uploaded ${addedUrls.length} image(s).`);
    } else {
      push('Could not upload image.', 'error');
    }
    setIsUploading(false);
  }

  // Title & Cyrillic validation
  const titleLength = (form.name || '').length;
  const hasCyrillic = /[\u0400-\u04FF]/.test(form.name || '');
  const descLength = (form.description || '').length;

  // Readiness scorecard
  const readinessChecklist = useMemo(() => {
    return [
      { id: 'name', label: 'Russian Product Title', ok: Boolean(form.name && hasCyrillic && titleLength <= 255) },
      { id: 'sku', label: 'SKU / Offer ID', ok: Boolean(form.sku) },
      { id: 'price', label: 'Main Price', ok: Boolean(Number(form.price) > 0) },
      { id: 'stock', label: 'FBS Stock', ok: form.stock !== '' && form.stock != null },
      { id: 'category', label: 'Category & Type ID', ok: Boolean(form.description_category_id && form.type_id) },
      { id: 'dims', label: 'Weight & Dimensions', ok: Boolean(form.weight && form.depth && form.width && form.height) },
      { id: 'images', label: 'At least 1 Image', ok: images.length > 0 },
      { id: 'vat', label: 'VAT Rate', ok: form.vat !== '' && form.vat != null },
    ];
  }, [form, hasCyrillic, titleLength, images.length]);

  const completedChecks = readinessChecklist.filter((c) => c.ok).length;
  const readinessPercent = Math.round((completedChecks / readinessChecklist.length) * 100);

  const missing = useMemo(() => {
    const gaps = [];
    if (!String(form.sku || '').trim()) gaps.push('SKU');
    if (!String(form.name || '').trim()) gaps.push('name');
    if (form.price === '' || form.price == null || Number.isNaN(Number(form.price))) gaps.push('price');
    if (!String(form.description_category_id || '').trim()) gaps.push('category ID');
    if (!String(form.type_id || '').trim()) gaps.push('type ID');
    if (images.length === 0) gaps.push('https image');
    if (form.vat === '' || form.vat == null) gaps.push('VAT');
    if (form.weight === '' || form.weight == null || Number.isNaN(Number(form.weight))) gaps.push('weight');
    if ([form.depth, form.width, form.height].some((value) => value === '' || value == null || Number.isNaN(Number(value)))) {
      gaps.push('depth, width, and height');
    }
    return gaps;
  }, [form, images.length]);

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
        body: JSON.stringify({ ...form, images: images.join('\n'), pushToOzon }),
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

  return (
    <div>
      <div className="prod-edit-topbar">
        <div className="prod-edit-head">
          <button type="button" className="dash-outline prod-back-btn" onClick={() => router.back()}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span>Back to Products</span>
          </button>
          <div className="prod-edit-title-group">
            <h1>Edit listing</h1>
            <div className="prod-edit-badges">
              <span className="prod-badge-account">{account?.name || 'Ozon Account'}</span>
              <span className="prod-badge-sku">SKU: {form.sku || product.sku || '—'}</span>
              {product.ozon_id && <span className="prod-badge-ozon">Ozon ID: {product.ozon_id}</span>}
            </div>
          </div>
        </div>
        <div className="prod-edit-actions">
          <button type="button" className="dash-outline prod-save-draft-btn" onClick={() => handleSave(false)} disabled={saving || pushing}>
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button type="button" className="dash-primary prod-save-push-btn" onClick={() => handleSave(true)} disabled={saving || pushing}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>{pushing ? 'Sending to Ozon...' : 'Save and push to Ozon'}</span>
          </button>
        </div>
      </div>

      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Basic Information */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24, color: '#0C5D58' }}>Basic Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <Field
                label="PRODUCT TITLE"
                wide
                info={
                  <div className="prod-char-info">
                    {hasCyrillic ? (
                      <span className="prod-badge-valid">✓ Russian / Cyrillic</span>
                    ) : (
                      <span className="prod-badge-warn">⚠️ Russian required</span>
                    )}
                    <span className={`prod-char-count ${titleLength > 255 ? 'is-danger' : (titleLength > 200 ? 'is-warn' : '')}`}>
                      {titleLength} / 255 chars
                    </span>
                  </div>
                }
              >
                <input
                  style={inputStyle()}
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="Russian title as required by Ozon..."
                />
              </Field>

              <Field label="SKU / OFFER ID">
                <input style={inputStyle()} value={form.sku} onChange={(e) => setField('sku', e.target.value)} />
              </Field>

              <Field label="BARCODE">
                <input style={inputStyle()} value={form.barcode} onChange={(e) => setField('barcode', e.target.value)} placeholder="EAN-13, UPC..." />
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

              <Field
                label="DESCRIPTION"
                wide
                info={
                  <div className="prod-char-info">
                    <span className="prod-char-count">{descLength} / 6,000 chars</span>
                  </div>
                }
              >
                <textarea
                  rows={6}
                  style={{ ...inputStyle(), resize: 'vertical' }}
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder="Russian product description and specifications..."
                />
              </Field>
            </div>
          </div>

          {/* Pricing & Inventory */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24, color: '#0C5D58' }}>Pricing & Inventory</h3>
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

          {/* Ozon category & package */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24, color: '#0C5D58' }}>Ozon category & package</h3>
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

          {/* Search & Discoverability */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 24, color: '#0C5D58' }}>Search & Discoverability</h3>
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

        {/* Right Column: Media Gallery, Ozon Readiness, & Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Optimization 4: Ozon Listing Readiness Scorecard */}
          <div className="prod-readiness-card">
            <div className="prod-readiness-head">
              <h3>Ozon Listing Readiness</h3>
              <span className="prod-readiness-pct">{readinessPercent}%</span>
            </div>
            <div className="prod-readiness-bar">
              <div className="prod-readiness-fill" style={{ width: `${readinessPercent}%` }} />
            </div>
            <ul className="prod-readiness-list">
              {readinessChecklist.map((item) => (
                <li key={item.id} className={`prod-readiness-item ${item.ok ? 'is-ok' : 'is-miss'}`}>
                  <span>{item.label}</span>
                  <span className={`prod-item-check ${item.ok ? 'is-ok' : 'is-miss'}`}>
                    {item.ok ? '✓' : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Optimization 3: Modern Interactive Media Gallery */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0C5D58', margin: 0 }}>
                Media Gallery ({images.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowRawUrls((v) => !v)}
                style={{ background: 'transparent', border: 'none', color: '#10756F', fontSize: 12, fontWeight: 650, cursor: 'pointer' }}
              >
                {showRawUrls ? 'Hide Raw URLs' : 'Raw URLs'}
              </button>
            </div>

            <div className="prod-media-gallery-wrap">
              {/* Image Grid */}
              <div className="prod-media-cards">
                {images.map((img, i) => (
                  <div key={`${img}-${i}`} className="prod-media-tile">
                    <img src={img} alt={`Product thumbnail ${i + 1}`} />
                    {i === 0 && <span className="prod-media-primary-badge">PRIMARY</span>}
                    <div className="prod-media-actions">
                      <div style={{ display: 'flex', gap: 3 }}>
                        {i > 0 && (
                          <button
                            type="button"
                            className="prod-media-btn"
                            title="Make Primary"
                            onClick={() => handleSetPrimary(i)}
                          >
                            ★ Set Primary
                          </button>
                        )}
                        {i > 0 && (
                          <button
                            type="button"
                            className="prod-media-btn"
                            title="Move Left"
                            onClick={() => handleMove(i, -1)}
                          >
                            ←
                          </button>
                        )}
                        {i < images.length - 1 && (
                          <button
                            type="button"
                            className="prod-media-btn"
                            title="Move Right"
                            onClick={() => handleMove(i, 1)}
                          >
                            →
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="prod-media-btn is-delete"
                        title="Remove Image"
                        onClick={() => handleDeleteImage(i)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Drag & Drop Upload Zone */}
              <div
                className={`prod-dropzone ${isDragging ? 'is-active' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFileUpload(e.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
                <svg className="prod-dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <p>{isUploading ? 'Uploading image...' : 'Drag & drop image here or click to browse'}</p>
                <span>Supports JPG, PNG, WEBP. First image is Primary on Ozon.</span>
              </div>

              {/* Quick Add URL */}
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#64748B', marginBottom: 4 }}>
                  ADD IMAGE BY URL
                </label>
                <div className="prod-media-url-add">
                  <input
                    type="url"
                    className="prod-media-url-input"
                    placeholder="https://example.com/image.jpg"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddImageUrl())}
                  />
                  <button type="button" className="prod-media-url-btn" onClick={handleAddImageUrl}>
                    + Add URL
                  </button>
                </div>
              </div>

              {/* Collapsible Raw URLs textarea */}
              {showRawUrls && (
                <Field label="IMAGE URLS (ONE PER LINE)">
                  <textarea
                    rows={6}
                    style={{ ...inputStyle(), resize: 'vertical', fontSize: 12 }}
                    value={form.images}
                    onChange={(e) => setField('images', e.target.value)}
                  />
                </Field>
              )}
            </div>
          </div>

          {/* Listing Status Card */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#0C5D58' }}>Listing status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Ozon status</span>
                <span style={{ fontSize: 12, fontWeight: 650 }}>{product.status_name || product.status || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Model ID</span>
                <span style={{ fontSize: 12, fontWeight: 650 }}>{product.variant_group_id || 'Standalone'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Created on Ozon</span>
                <span style={{ fontSize: 12, fontWeight: 650 }}>{product.ozon_created_at ? new Date(product.ozon_created_at).toLocaleDateString('en-GB') : '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>FBO stock</span>
                <span style={{ fontSize: 12, fontWeight: 650 }}>{product.fbo_stock ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Reserved</span>
                <span style={{ fontSize: 12, fontWeight: 650 }}>{product.reserved_stock ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Warehouse</span>
                <span style={{ fontSize: 12, fontWeight: 650 }}>{form.warehouse_name || form.warehouse_id || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
