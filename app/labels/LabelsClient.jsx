'use client';

import { useEffect, useRef, useState } from 'react';
import DocumentPicker from './DocumentPicker';
import ToastStack, { useToasts } from '../ToastStack';

function isPdf(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  return name.endsWith('.pdf') || file.type === 'application/pdf';
}

function formatSize(bytes) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function savePdf(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'thermal-labels.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === 'file' && (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </>
      )}
      {name === 'upload' && (
        <>
          <path d="M12 16V6" />
          <path d="M8 9.5 12 5.5l4 4" />
          <path d="M5 19h14" />
        </>
      )}
      {name === 'check' && <path d="M5 12.5 9.2 17 19 7" />}
      {name === 'download' && (
        <>
          <path d="M12 4v10" />
          <path d="M8 10.5 12 14.5l4-4" />
          <path d="M5 19h14" />
        </>
      )}
    </svg>
  );
}

function DropPanel({ id, title, help, file, busy, onFile, onReject }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');

  function accept(next) {
    if (!next || busy) return;
    if (!isPdf(next)) {
      setError('This file is not a PDF. Choose another file.');
      onReject();
      return;
    }
    setError('');
    onFile(next);
  }

  return (
    <div className={`label-panel${error ? ' is-bad' : ''}${file ? ' is-ready' : ''}`}>
      <div className="label-panel-head">
        <span className="label-mark"><Icon name="file" /></span>
        <div>
          <h2>{title}</h2>
          <p>{help}</p>
        </div>
      </div>
      <div
        className={`label-drop${over ? ' is-over' : ''}${file ? ' has-file' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          accept(event.dataTransfer.files?.[0] || null);
        }}
      >
        {file ? (
          <div className="label-file">
            <span className="label-mark"><Icon name="file" /></span>
            <div>
              <strong title={file.name}>{file.name}</strong>
              <p>
                {formatSize(file.size) || 'Size unavailable'}
                <span aria-hidden="true"> · </span>
                Ready
              </p>
            </div>
            <span className="label-ok" aria-label="PDF accepted"><Icon name="check" /></span>
            <button type="button" className="dash-outline" disabled={busy} onClick={() => inputRef.current?.click()}>
              Replace
            </button>
          </div>
        ) : (
          <>
            <span className="label-cloud"><Icon name="upload" /></span>
            <span>{over ? 'Drop the PDF here.' : 'Drag and drop your PDF here.'}</span>
            <label htmlFor={id} className="dash-outline label-browse">Browse file</label>
          </>
        )}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(event) => {
            accept(event.target.files?.[0] || null);
            event.target.value = '';
          }}
        />
      </div>
      {error ? <p className="label-field-error" role="alert">{error}</p> : null}
    </div>
  );
}

function StudioMark() {
  return (
    <svg className="label-studio-art" viewBox="0 0 220 140" aria-hidden="true">
      <rect x="18" y="28" width="128" height="84" rx="10" fill="#FFFFFF" stroke="#DBE7FF" />
      <rect x="30" y="42" width="72" height="8" rx="3" fill="#2563EB" />
      <rect x="30" y="58" width="104" height="5" rx="2" fill="#E2E8F0" />
      <rect x="30" y="70" width="88" height="5" rx="2" fill="#E2E8F0" />
      <rect x="30" y="86" width="64" height="14" rx="2" fill="#172033" />
      <path d="M148 46h46a8 8 0 0 1 8 8v52a8 8 0 0 1-8 8h-46" fill="#EFF6FF" stroke="#BFDBFE" />
      <rect x="162" y="62" width="28" height="18" rx="3" fill="#FFFFFF" stroke="#93C5FD" />
      <path d="M168 90h18M168 96h12" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function LabelsClient() {
  const [shippingLabel, setShippingLabel] = useState(null);
  const [productList, setProductList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [latestState, setLatestState] = useState('loading');
  const { toasts, push, dismiss } = useToasts();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/labels/latest', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not load the latest file.');
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.latest) {
          setResult(data.latest);
          setLatestState('ready');
        } else {
          setLatestState('empty');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLatestState('error');
        push(err.message, 'error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function chooseShipping(file) {
    setShippingLabel(file);
  }

  function chooseProduct(file) {
    setProductList(file);
  }

  async function generate(event) {
    event.preventDefault();
    if (busy) return;
    if (!shippingLabel || !productList) {
      push('Choose both PDF files.', 'error');
      return;
    }
    if (!isPdf(shippingLabel) || !isPdf(productList)) {
      push('Both files must be PDFs.', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('shippingLabel', shippingLabel);
      body.append('productList', productList);
      const res = await fetch('/api/labels/process', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not generate labels');
      setResult(data);
      setLatestState('ready');
      const count = typeof data.labelCount === 'number' ? data.labelCount : null;
      const filename = data.filename || 'thermal-labels.pdf';
      push(count == null
        ? `Labels saved as ${filename}. The PDF is downloading.`
        : `${count} ${count === 1 ? 'label' : 'labels'} saved as ${filename}. The PDF is downloading.`);
      if (data.downloadUrl) savePdf(data.downloadUrl, filename);
      const latestRes = await fetch('/api/labels/latest', { cache: 'no-store' });
      const latestData = await latestRes.json().catch(() => ({}));
      if (latestRes.ok && latestData.latest) setResult(latestData.latest);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const created = formatWhen(result?.createdAt);
  const countIsNumber = typeof result?.labelCount === 'number';

  return (
    <div className="label-page">
      <header className="label-hero">
        <div>
          <p className="label-kicker">Labels</p>
          <h1>Label Generator</h1>
          <p>Find eligible orders, download shipping documents, and generate thermal labels.</p>
        </div>
        <div className="label-studio" aria-hidden="true">
          <StudioMark />
        </div>
      </header>

      <DocumentPicker onMessage={push} />
      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <div className="label-layout">
        <form onSubmit={generate} className="stat-card label-form">
          <div className="label-uploads">
            <DropPanel
              id="shipping-label"
              title="Shipping label PDF"
              help="The Ozon label file with shipment barcodes."
              file={shippingLabel}
              busy={busy}
              onFile={chooseShipping}
              onReject={() => push('Shipping label must be a PDF.', 'error')}
            />
            <DropPanel
              id="product-list"
              title="Product list PDF"
              help="The product list used to match titles."
              file={productList}
              busy={busy}
              onFile={chooseProduct}
              onReject={() => push('Product list must be a PDF.', 'error')}
            />
          </div>
          <div className="label-actions">
            <button type="submit" className="dash-primary label-generate" disabled={busy || !shippingLabel || !productList}>
              <Icon name="file" />
              {busy ? 'Generating...' : 'Generate Thermal Labels'}
            </button>
            <p>Make sure both files are PDFs and belong to the same shipment.</p>
          </div>
        </form>

        <aside className="stat-card label-guide" aria-label="How label generation works">
          <h2>How it works</h2>
          <ol>
            <li><span>1</span>Upload the shipping-label PDF.</li>
            <li><span>2</span>Upload the product-list PDF.</li>
            <li><span>3</span>Generate the 4×6 thermal-label PDF.</li>
          </ol>
        </aside>
      </div>

      <section className="stat-card label-latest">
        <div className="label-latest-head">
          <span className="label-mark"><Icon name="file" /></span>
          <div>
            <h2>Latest file</h2>
            <p>Your most recently generated label file.</p>
          </div>
        </div>

        {latestState === 'loading' && <p className="label-empty">Checking for a generated file...</p>}
        {latestState === 'empty' && <p className="label-empty">No generated file yet. Generate a PDF to see it here.</p>}
        {latestState === 'ready' && result && (
          <div className="label-doc">
            <span className="label-doc-icon"><Icon name="file" /></span>
            <div>
              <strong title={result.filename || ''}>{result.filename || '—'}</strong>
              <p>
                {created ? `Generated on ${created}` : 'Generated time unavailable'}
                <span aria-hidden="true"> · </span>
                {countIsNumber
                  ? `${result.labelCount} ${result.labelCount === 1 ? 'label' : 'labels'}`
                  : 'Label count unavailable'}
              </p>
            </div>
            {result.downloadUrl ? (
              <a className="dash-outline label-download" href={result.downloadUrl} download={result.filename || 'thermal-labels.pdf'}>
                <Icon name="download" />
                Download PDF
              </a>
            ) : (
              <span className="label-empty">Download unavailable</span>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
