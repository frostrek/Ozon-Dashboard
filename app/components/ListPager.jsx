'use client';

import Link from 'next/link';

function pageItems(current, count) {
  const pageCount = Math.max(1, Number(count) || 1);
  const page = Math.min(Math.max(1, Number(current) || 1), pageCount);
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const numbers = [1, pageCount, page - 1, page, page + 1].filter((number) => number >= 1 && number <= pageCount);
  const unique = [...new Set(numbers)].sort((left, right) => left - right);
  const items = [];
  unique.forEach((number, index) => {
    if (index > 0 && number - unique[index - 1] > 1) items.push(`gap-${number}`);
    items.push(number);
  });
  return items;
}

function PageControl({ href, onClick, disabled, current, children, label }) {
  const className = `pipe-page-btn${current ? ' is-current' : ''}${disabled ? ' is-disabled' : ''}`;
  if (disabled) return <span className={className} aria-hidden="true">{children}</span>;
  if (href) {
    return (
      <Link className={className} href={href} aria-label={label} aria-current={current ? 'page' : undefined}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} aria-label={label} aria-current={current ? 'page' : undefined}>
      {children}
    </button>
  );
}

function queryHref(base, query, page, pageSize, defaultPageSize) {
  const params = new URLSearchParams();
  const next = { ...query, page: String(page) };
  if (pageSize != null) next.pageSize = String(pageSize);
  for (const [key, value] of Object.entries(next)) {
    if (!value || value === 'all' || (key === 'page' && value === '1') || (key === 'pageSize' && value === String(defaultPageSize))) continue;
    params.set(key, value);
  }
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}

export default function ListPager({
  label = 'Pages',
  page,
  pageCount,
  start,
  end,
  total,
  noun = 'items',
  hrefFor,
  onPage,
  pageSize,
  pageSizes,
  hrefForSize,
  onPageSize,
  hrefBase,
  hrefQuery,
  defaultPageSize = '20',
}) {
  const count = Math.max(0, Number(total) || 0);
  const pages = Math.max(1, Number(pageCount) || 1);
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const range = count === 0
    ? `Showing 0 ${noun}`
    : `Showing ${Number(start).toLocaleString('en-US')}–${Number(end).toLocaleString('en-US')} of ${count.toLocaleString('en-US')} ${noun}`;
  const pageHref = hrefBase
    ? (next) => queryHref(hrefBase, hrefQuery, next, pageSize, defaultPageSize)
    : hrefFor;
  const sizeHref = hrefBase
    ? (size) => queryHref(hrefBase, hrefQuery, 1, size, defaultPageSize)
    : hrefForSize;

  return (
    <nav className="pipe-pager list-pager" aria-label={label}>
      <span>{range}</span>
      {pageSizes?.length ? (
        <div className="list-sizes">
          <span>Rows per page</span>
          {pageSizes.map((size) => {
            const className = Number(pageSize) === Number(size) ? 'pipe-page-btn is-current' : 'pipe-page-btn';
            if (sizeHref) return <Link key={size} className={className} href={sizeHref(size)}>{size}</Link>;
            return <button key={size} type="button" className={className} onClick={() => onPageSize?.(size)}>{size}</button>;
          })}
        </div>
      ) : null}
      <div className="list-pages">
        <PageControl href={pageHref?.(1)} onClick={() => onPage?.(1)} disabled={current <= 1} label="First page">«</PageControl>
        <PageControl href={pageHref?.(current - 1)} onClick={() => onPage?.(current - 1)} disabled={current <= 1}>Previous</PageControl>
        {pageItems(current, pages).map((item) => (
          typeof item === 'number'
            ? <PageControl key={item} href={pageHref?.(item)} onClick={() => onPage?.(item)} current={item === current}>{item}</PageControl>
            : <span key={item} className="pipe-page-gap">…</span>
        ))}
        <PageControl href={pageHref?.(current + 1)} onClick={() => onPage?.(current + 1)} disabled={current >= pages}>Next</PageControl>
        <PageControl href={pageHref?.(pages)} onClick={() => onPage?.(pages)} disabled={current >= pages} label="Last page">»</PageControl>
      </div>
    </nav>
  );
}
