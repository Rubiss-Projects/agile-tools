type LocalBootstrapMode = 'admin' | 'demo';

interface LocalBootstrapFormProps {
  label: string;
  nextPath: string;
  mode?: LocalBootstrapMode;
  variant?: 'primary' | 'secondary';
}

export function LocalBootstrapForm({
  label,
  nextPath,
  mode = 'demo',
  variant = 'primary',
}: LocalBootstrapFormProps) {
  const buttonStyle =
    variant === 'primary'
      ? {
          padding: '0.8rem 1rem',
          borderRadius: '9999px',
          border: 'none',
          background: '#0f172a',
          color: 'white',
          fontWeight: 600,
          cursor: 'pointer',
        }
      : {
          padding: '0.8rem 1rem',
          borderRadius: '9999px',
          border: '1px solid #cbd5e1',
          background: 'white',
          color: '#0f172a',
          fontWeight: 600,
          cursor: 'pointer',
        };

  return (
    <form action="/api/local/bootstrap" method="post" style={{ margin: 0 }}>
      <input type="hidden" name="next" value={nextPath} />
      <input type="hidden" name="mode" value={mode} />
      <button type="submit" style={buttonStyle}>
        {label}
      </button>
    </form>
  );
}

export { LocalBootstrapForm as DemoBootstrapForm };