'use client';

export default function AppError({ error, reset }) {
  return (
    <section className="stat-card dash-empty">
      <h2>Could not load this page</h2>
      <p>{error?.message || 'The data request failed. Nothing below is filled in with a guess.'}</p>
      <button type="button" onClick={reset}>Try again</button>
    </section>
  );
}
