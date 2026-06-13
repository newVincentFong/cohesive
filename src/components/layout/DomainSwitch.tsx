import type { Domain } from "@/core/session/session.types";

interface DomainSwitchProps {
  activeDomain: Domain;
  onChange: (domain: Domain) => void;
}

const domains: { id: Domain; label: string }[] = [
  { id: "code", label: "Code" },
  { id: "writing", label: "Writing" },
  { id: "mind", label: "Mind" },
];

export function DomainSwitch({ activeDomain, onChange }: DomainSwitchProps) {
  return (
    <div className="domain-switch">
      {domains.map((domain) => (
        <button
          key={domain.id}
          className={activeDomain === domain.id ? "active" : undefined}
          onClick={() => onChange(domain.id)}
        >
          {domain.label}
        </button>
      ))}
    </div>
  );
}
