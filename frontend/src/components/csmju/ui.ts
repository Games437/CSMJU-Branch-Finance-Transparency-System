// ============================================================================
// Purely presentational class-constant strings for the CSMJU brand system
// (ui-design-system.md v1.3.0, visual sections only). No business logic
// lives here — these are just Tailwind class strings shared across pages
// and components so every button/input/card/table looks the same.
// ============================================================================

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-container";
const disabledState = "disabled:opacity-40 disabled:cursor-not-allowed";
const touchTarget = "min-h-11 md:min-h-0";

const baseButton = `inline-flex items-center justify-center gap-2 rounded-lg text-label-md px-4 py-2.5 ${touchTarget} transition-transform ${focusRing} ${disabledState}`;

export const primaryButtonClass = `${baseButton} btn-gradient text-on-primary shadow-md hover:scale-[1.02] active:scale-[0.98]`;

export const secondaryButtonClass = `${baseButton} border border-outline-variant bg-transparent text-on-surface-variant hover:bg-surface-variant/50`;

export const dangerButtonClass = `${baseButton} bg-error text-white hover:opacity-90`;

export const tonalButtonClass = `${baseButton} bg-primary-container/10 text-primary-container hover:bg-primary-container/20`;

export const inputClass =
  `w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-body-md text-on-surface placeholder:text-outline ${focusRing} focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed`;

export const labelClass = "mb-1.5 block text-label-md text-on-surface";

export const cardClass =
  "overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest shadow-sm";

export const thClass = "px-6 py-4 text-label-md text-on-surface-variant font-semibold whitespace-nowrap text-left";

export const tdClass = "px-6 py-4 text-body-md text-on-surface";

const baseIconButton = `inline-flex h-9 w-9 items-center justify-center rounded-lg text-outline transition-colors ${focusRing} ${disabledState}`;

export const iconButtonClass = `${baseIconButton} hover:bg-primary-container/10 hover:text-primary-container`;

export const iconDangerButtonClass = `${baseIconButton} hover:bg-error-container hover:text-error`;

export const alertBaseClass = "rounded-xl border p-4 text-body-md";

export const alertClasses = {
  info: `${alertBaseClass} border-primary-container/30 bg-primary-fixed/40 text-on-surface`,
  warning: `${alertBaseClass} border-brand-amber/40 bg-brand-amber/10 text-on-surface`,
  error: `${alertBaseClass} border-error-container bg-error-container text-on-error-container`,
  success: `${alertBaseClass} border-success/30 bg-success/10 text-emerald-700`,
};

export const tableRowHoverClass = "hover:bg-surface/50";
