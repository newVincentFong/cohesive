import { useEffect, useState } from "react";
import type { AppSettings } from "@/core/settings/settings.service";
import {
  completeOnboarding,
  getAppSettings,
  saveApiKey,
} from "@/core/settings/settings.service";

interface OnboardingModalProps {
  onCompleted: () => void;
}

export function OnboardingModal({ onCompleted }: OnboardingModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [skipKey, setSkipKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      if (!skipKey && apiKey.trim()) {
        await saveApiKey(apiKey.trim());
      }
      await completeOnboarding();
      onCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div>
          <h2>Welcome to Cohesive</h2>
          <p className="muted">
            Local-first workspace for Code, Writing, and Mind. Add your DeepSeek
            API key to enable AI features.
          </p>
        </div>
        <label>
          <div className="muted onboarding-label">
            DeepSeek API Key
          </div>
          <input
            className="text-input"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            disabled={skipKey}
          />
        </label>
        <label className="muted">
          <input
            type="checkbox"
            checked={skipKey}
            onChange={(event) => setSkipKey(event.target.checked)}
          />{" "}
          Configure later
        </label>
        {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : null}
        <button
          className="primary-button"
          onClick={() => void handleSubmit()}
          disabled={saving || (!skipKey && !apiKey.trim())}
        >
          {saving ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}

export function useOnboardingGate() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getAppSettings()
      .then(setSettings)
      .finally(() => setLoading(false));
  }, []);

  return {
    loading,
    needsOnboarding: settings ? !settings.onboardingCompleted : false,
    settings,
    refresh: async () => setSettings(await getAppSettings()),
  };
}
