export default function GlobalLoading() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        height: '100%',
        width: '100%',
        gap: '16px',
        padding: '40px',
      }}
    >
      <div
        style={{
          width: '38px',
          height: '38px',
          border: '3px solid #E2E8F0',
          borderTopColor: '#10756F',
          borderRadius: '50%',
          animation: 'dashSpin 0.7s linear infinite',
        }}
      />
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>
        Loading page...
      </div>
      <style>{`
        @keyframes dashSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

