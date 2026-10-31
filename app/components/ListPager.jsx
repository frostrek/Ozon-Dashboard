'use client';

import ReactPaginate from 'react-paginate';

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
            if (sizeHref) return <a key={size} className={className} href={sizeHref(size)}>{size}</a>;
            return <button key={size} type="button" className={className} onClick={() => onPageSize?.(size)}>{size}</button>;
          })}
        </div>
      ) : null}
      <ReactPaginate
        forcePage={current - 1}
        pageCount={pages}
        disableInitialCallback
        pageRangeDisplayed={3}
        marginPagesDisplayed={1}
        breakLabel="…"
        previousLabel="Previous"
        nextLabel="Next"
        onPageChange={({ selected }) => {
          const next = selected + 1;
          if (next !== current) onPage?.(next);
        }}
        hrefBuilder={pageHref ? (pageNumber) => pageHref(pageNumber) : undefined}
        hrefAllControls={Boolean(pageHref)}
        renderOnZeroPageCount={null}
        containerClassName="list-pages"
        pageLinkClassName="pipe-page-btn"
        previousLinkClassName="pipe-page-btn"
        nextLinkClassName="pipe-page-btn"
        breakLinkClassName="pipe-page-gap"
        activeLinkClassName="is-current"
        disabledClassName="is-disabled"
      />
    </nav>
  );
}
