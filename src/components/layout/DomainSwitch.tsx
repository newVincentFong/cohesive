import type { Domain } from "@/core/session/session.types";
import { ENABLED_DOMAINS } from "@/core/product-flags";

interface DomainSwitchProps {
  activeDomain: Domain;
  onChange: (domain: Domain) => void;
}

const domainLabels: Record<Domain, string> = {
  code: "Code",
  writing: "Writing",
  mind: "Mind",
};

export function DomainSwitch({ activeDomain, onChange }: DomainSwitchProps) {
  const domains = ENABLED_DOMAINS.map((id) => ({
    id,
    label: domainLabels[id],
  }));

  if (domains.length <= 1) {
    return null;
  }

  return (
    <div className="sidebar-domain-switch">
      <div className="domain-switch">
        {domains.map((domain) => (
          <button
            key={domain.id}
            type="button"
            className={activeDomain === domain.id ? "active" : undefined}
            onClick={() => onChange(domain.id)}
          >
            {domain.label}
          </button>
        ))}
      </div>
    </div>
  );
}
