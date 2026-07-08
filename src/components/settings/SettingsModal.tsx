import { useEffect, useId, useRef, useState } from "react";
import {
  clearApiKey,
  getAppSettings,
  saveApiKey,
} from "@/core/settings/settings.service";
import { ApiKeyField } from "./ApiKeyField";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setApiKey("");
    setError(null);
    setSuccess(null);
    void getAppSettings().then((settings) => setHasApiKey(settings.hasApiKey));
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  async function handleSave() {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveApiKey(trimmed);
      setApiKey("");
      setHasApiKey(true);
      setSuccess("API key saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    setSuccess(null);
    try {
      await clearApiKey();
      setHasApiKey(false);
      setSuccess("API key removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove API key");
    } finally {
      setRemoving(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="onboarding-overlay" onClick={onClose}>
      <div
        className="onboarding-card settings-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h2 id={titleId}>Settings</h2>
        </div>

        <section className="settings-section">
          <div className="settings-section-header">
            <span
              className={`settings-status${hasApiKey ? " settings-status--configured" : ""}`}
            >
              {hasApiKey ? "Configured" : "Not configured"}
            </span>
          </div>
          <p className="muted settings-helper">
            Saved to .cohesive/api-key in your home folder. The key is never shown after saving.
          </p>
          <ApiKeyField value={apiKey} onChange={setApiKey} inputRef={inputRef} />
        </section>

        {error ? <div className="settings-message settings-message--error">{error}</div> : null}
        {success ? (
          <div className="settings-message settings-message--success">{success}</div>
        ) : null}

        <div className="settings-actions">
          {hasApiKey ? (
            <button
              className="secondary-button"
              onClick={() => void handleRemove()}
              disabled={saving || removing}
            >
              {removing ? "Removing..." : "Remove"}
            </button>
          ) : null}
          <button
            className="primary-button"
            onClick={() => void handleSave()}
            disabled={saving || removing || !apiKey.trim()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            className="ghost-button"
            onClick={onClose}
            disabled={saving || removing}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
