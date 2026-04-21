import { buttonStyle } from './chrome';

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
  return (
    <form action="/api/local/bootstrap" method="post" style={{ margin: 0 }}>
      <input type="hidden" name="next" value={nextPath} />
      <input type="hidden" name="mode" value={mode} />
      <button type="submit" style={buttonStyle(variant)}>
        {label}
      </button>
    </form>
  );
}

export { LocalBootstrapForm as DemoBootstrapForm };
