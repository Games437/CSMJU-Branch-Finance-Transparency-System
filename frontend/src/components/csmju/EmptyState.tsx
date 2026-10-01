import type { ReactNode } from "react";
import { primaryButtonClass } from "./ui";

interface Props {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

const defaultIcon = (
  <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-outline" aria-hidden="true">
    <path
      d="M4 7h16M4 12h16M4 17h10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export function EmptyState({ title, description, icon, actionLabel, onAction }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container">
        {icon ?? defaultIcon}
      </div>
      <p className="text-label-md text-on-surface">{title}</p>
      {description && <p className="max-w-sm text-body-md text-on-surface-variant">{description}</p>}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className={`${primaryButtonClass} mt-2`}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
