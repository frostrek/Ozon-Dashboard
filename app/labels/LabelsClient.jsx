'use client';

import { useEffect, useState } from 'react';

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

function DropPanel({ id, title, help, file, onFile, onReject }) {
  const [over, setOver] = useState(false);

  function accept(next) {
    if (!next) return;
    if (!isPdf(next)) {
      onReject();
      return;
    }
    onFile(next);
  }

  return (
    <div className="label-panel">
      <div className="label-panel-head">
        <span className="label-mark"><Icon name="file" /></span>
        <div>
          <h2>{title}</h2>
          <p>{help}</p>
        </div>
      </div>
      <label
        className={`label-drop${over ? ' is-over' : ''}`}
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          accept(event.dataTransfer.files?.[0] || null);
        }}
      >
        <span className="label-cloud"><Icon name="upload" /></span>
        <span>{file ? 'Replace file or drag and drop' : 'Choose file or drag and drop'}</span>
        <input
          id={id}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            accept(event.target.files?.[0] || null);
            event.target.value = '';
          }}
        />
      </label>
      <p className="label-chosen" title={file ? file.name : ''}>
        {file ? `${file.name}${formatSize(file.size) ? ` · ${formatSize(file.size)}` : ''}` : 'No file chosen'}
      </p>
    </div>
  );
}

export default function LabelsClient() {
  const [shippingLabel, setShippingLabel] = useState(null);
  const [productList, setProductList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState(null);
  const [latestState, setLatestState] = useState('loading');
  const [latestError, setLatestError] = useState('');

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
        setLatestError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function chooseShipping(file) {
    setShippingLabel(file);
    setError('');
    setNotice('');
  }

  function chooseProduct(file) {
    setProductList(file);
    setError('');
    setNotice('');
  }

  async function generate(event) {
    event.preventDefault();
    if (busy) return;
    if (!shippingLabel || !productList) {
      setError('Choose both PDF files.');
      setNotice('');
      return;
    }
    if (!isPdf(shippingLabel) || !isPdf(productList)) {
      setError('Both files must be PDFs.');
      setNotice('');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
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
      setNotice(count == null ? 'Labels generated.' : `Labels generated. ${count} ${count === 1 ? 'label' : 'labels'}.`);
      const latestRes = await fetch('/api/labels/latest', { cache: 'no-store' });
      const latestData = await latestRes.json().catch(() => ({}));
      if (latestRes.ok && latestData.latest) setResult(latestData.latest);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const created = formatWhen(result?.createdAt);
  const countIsNumber = typeof result?.labelCount === 'number';

  return (
    <div className="label-page">
      <header className="page-head">
        <p className="label-kicker">Labels</p>
        <h1>Label Generator</h1>
        <p className="page-lead">Upload the Ozon shipping-label PDF and the product-list PDF. The result is a 4×6 thermal PDF.</p>
      </header>

      <div className="label-layout">
        <form onSubmit={generate} className="stat-card label-form">
          <div className="label-uploads">
            <DropPanel
              id="shipping-label"
              title="Shipping label PDF"
              help="The Ozon label file with shipment barcodes."
              file={shippingLabel}
              onFile={chooseShipping}
              onReject={() => setError('Shipping label must be a PDF.')}
            />
            <DropPanel
              id="product-list"
              title="Product list PDF"
              help="The product list used to match titles."
              file={productList}
              onFile={chooseProduct}
              onReject={() => setError('Product list must be a PDF.')}
            />
          </div>
          <div className="label-actions">
            <button type="submit" className="dash-primary label-generate" disabled={busy}>
              {busy ? 'Generating...' : 'Generate'}
            </button>
            <p>Make sure both files are PDFs and belong to the same shipment.</p>
          </div>
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          {notice && <p className="notice notice-ok" role="status">{notice}</p>}
        </form>

        <aside className="stat-card label-guide" aria-label="How label generation works">
          <h2>How it works</h2>
          <ol>
            <li><span className="label-check"><Icon name="check" /></span>Upload the shipping-label PDF.</li>
            <li><span className="label-check"><Icon name="check" /></span>Upload the product-list PDF.</li>
            <li><span className="label-check"><Icon name="check" /></span>Generate the 4×6 thermal-label PDF.</li>
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
        {latestState === 'error' && <p className="notice notice-error" role="alert">{latestError}</p>}
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
              <a className="dash-outline label-download" href={result.downloadUrl}>
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
