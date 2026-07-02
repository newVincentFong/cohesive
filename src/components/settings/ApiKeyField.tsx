interface ApiKeyFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ApiKeyField({ value, onChange, disabled }: ApiKeyFieldProps) {
  return (
    <label>
      <div className="muted onboarding-label">DeepSeek API Key</div>
      <input
        className="text-input"
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="sk-..."
        disabled={disabled}
      />
    </label>
  );
}
