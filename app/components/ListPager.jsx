'use client';

import Link from 'next/link';
import Pagination from 'rc-pagination';

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
  pageSize: pageSizeProp,
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
  const pageSize = Number(pageSizeProp) > 0
    ? Number(pageSizeProp)
    : (count > 0 ? Math.max(1, Math.ceil(count / pages)) : 10);
  const range = count === 0
    ? `Showing 0 ${noun}`
    : `Showing ${Number(start).toLocaleString('en-US')}–${Number(end).toLocaleString('en-US')} of ${count.toLocaleString('en-US')} ${noun}`;
  const pageHref = hrefBase
    ? (next) => queryHref(hrefBase, hrefQuery, next, pageSizeProp, defaultPageSize)
    : hrefFor;
  const sizeHref = hrefBase
    ? (size) => queryHref(hrefBase, hrefQuery, 1, size, defaultPageSize)
    : hrefForSize;

  function go(next) {
    const target = Math.min(Math.max(1, next), pages);
    if (target !== current) onPage?.(target);
  }

  function itemRender(pageNum, type) {
    const active = type === 'page' && pageNum === current;
    const className = `pipe-page-btn${active ? ' is-current' : ''}`;

    if (type === 'page') {
      if (pageHref) {
        return (
          <Link href={pageHref(pageNum)} className={className} aria-current={active ? 'page' : undefined}>
            {pageNum}
          </Link>
        );
      }
      return (
        <button type="button" className={className} onClick={() => go(pageNum)} aria-current={active ? 'page' : undefined}>
          {pageNum}
        </button>
      );
    }

    if (type === 'prev') {
      const target = current - 1;
      if (current <= 1) return <span className="pipe-page-btn is-disabled">Previous</span>;
      if (pageHref) return <Link href={pageHref(target)} className="pipe-page-btn" aria-label="Previous page">Previous</Link>;
      return <button type="button" className="pipe-page-btn" onClick={() => go(target)} aria-label="Previous page">Previous</button>;
    }

    if (type === 'next') {
      const target = current + 1;
      if (current >= pages) return <span className="pipe-page-btn is-disabled">Next</span>;
      if (pageHref) return <Link href={pageHref(target)} className="pipe-page-btn" aria-label="Next page">Next</Link>;
      return <button type="button" className="pipe-page-btn" onClick={() => go(target)} aria-label="Next page">Next</button>;
    }

    if (type === 'jump-prev' || type === 'jump-next') {
      return <span className="pipe-page-gap">…</span>;
    }

    return null;
  }

  return (
    <nav className="pipe-pager list-pager" aria-label={label}>
      <span>{range}</span>
      {pageSizes?.length ? (
        <div className="list-sizes">
          <span>Rows per page</span>
          {pageSizes.map((size) => {
            const sizeClass = Number(pageSizeProp) === Number(size) ? 'pipe-page-btn is-current' : 'pipe-page-btn';
            if (sizeHref) return <Link key={size} className={sizeClass} href={sizeHref(size)}>{size}</Link>;
            return <button key={size} type="button" className={sizeClass} onClick={() => onPageSize?.(size)}>{size}</button>;
          })}
        </div>
      ) : null}
      <Pagination
        className="list-pages-rc"
        current={current}
        total={count}
        pageSize={pageSize}
        onChange={pageHref ? undefined : go}
        itemRender={itemRender}
        showSizeChanger={false}
        showLessItems
      />
    </nav>
  );
}
