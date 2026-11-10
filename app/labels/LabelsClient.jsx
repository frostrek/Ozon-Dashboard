'use client';

function printPdf(url) {
  if (!url) return;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      window.open(url, '_blank');
    }
  };
  document.body.appendChild(iframe);
}

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

function PrinterHeaderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px', color: '#10756F' }} aria-hidden="true">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" rx="1" fill="#FFFFFF" />
      <circle cx="18" cy="14" r="1" fill="currentColor" />
    </svg>
  );
}

function FilePdfIcon() {
  return (
    <svg viewBox="0 0 32 36" fill="none" style={{ width: '28px', height: '32px' }} aria-hidden="true">
      <defs>
        <linearGradient id="pdfBodyGrad" x1="4" y1="2" x2="26" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F1F5F9" />
        </linearGradient>
      </defs>
      <path
        d="M6 4C6 2.89543 6.89543 2 8 2H20L28 10V32C28 33.1046 27.1046 34 26 34H8C6.89543 34 6 33.1046 6 32V4Z"
        fill="url(#pdfBodyGrad)"
        stroke="#CBD5E1"
        strokeWidth="1.2"
      />
      <path d="M20 2V9C20 9.55228 20.4477 10 21 10H28" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1.2" />
      <rect x="10" y="14" width="2" height="7" rx="0.5" fill="#1E293B" />
      <rect x="13" y="14" width="1" height="7" rx="0.5" fill="#1E293B" />
      <rect x="15.5" y="14" width="2.5" height="7" rx="0.5" fill="#1E293B" />
      <rect x="19.5" y="14" width="1" height="7" rx="0.5" fill="#1E293B" />
      <rect x="22" y="14" width="2" height="7" rx="0.5" fill="#1E293B" />
      <rect x="8.5" y="24" width="15" height="6.5" rx="2" fill="#EF4444" />
      <text x="16" y="28.8" fill="#FFFFFF" fontSize="4.2" fontWeight="800" textAnchor="middle" fontFamily="system-ui, sans-serif" letterSpacing="0.3">PDF</text>
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
        <div className="label-hero-main">
          <h1>Labels</h1>
        </div>
      </header>

      <DocumentPicker
        onMessage={push}
        onGenerated={(data) => {
          setResult(data);
          setLatestState('ready');
        }}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />

      <section className="stat-card label-latest">
        <div className="label-latest-head">
          <span className="label-mark"><PrinterHeaderIcon /></span>
          <div>
            <h2>Latest Generated File</h2>
            <p>Your most recently compiled thermal label document.</p>
          </div>
        </div>

        {latestState === 'loading' && <p className="label-empty">Checking for recent files...</p>}
        {latestState === 'empty' && <p className="label-empty">No generated file yet. Click "⚡ Generate 4×6 Thermal Labels" above to compile.</p>}
        {latestState === 'ready' && result && (
          <div className="label-doc">
            <span className="label-doc-icon"><FilePdfIcon /></span>
            <div className="label-doc-info">
              <strong title={result.filename || ''}>{result.filename || 'thermal-labels.pdf'}</strong>
              <p>
                {created ? `Generated ${created}` : 'Generated recently'}
                <span aria-hidden="true"> · </span>
                <span className="label-count-badge">
                  {countIsNumber
                    ? `${result.labelCount} ${result.labelCount === 1 ? 'label' : 'labels'}`
                    : 'Labels ready'}
                </span>
              </p>
            </div>
            <div className="label-doc-actions">
              {result.downloadUrl ? (
                <button
                  type="button"
                  className="dash-primary label-print-btn"
                  onClick={() => printPdf(result.downloadUrl)}
                  title="Directly trigger thermal label print dialog"
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  <span>Print Labels</span>
                </button>
              ) : (
                <span className="label-empty">Download unavailable</span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
