export default function Loading() {
  return (
    <div className="dash-skeleton" aria-busy="true" aria-live="polite">
      <span />
      <span />
      <div className="dash-skeleton-card" />
    </div>
  );
}
