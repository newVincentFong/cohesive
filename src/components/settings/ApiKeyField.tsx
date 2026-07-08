import type { RefObject } from "react";

interface ApiKeyFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}

export function ApiKeyField({ value, onChange, disabled, inputRef }: ApiKeyFieldProps) {
  return (
    <label>
      <div className="muted onboarding-label">DeepSeek API Key</div>
      <input
        ref={inputRef}
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
