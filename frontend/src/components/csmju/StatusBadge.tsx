import { statusBadgeClasses, statusLabelTh, statusTone } from "@/lib/status-styles";
import type { TransactionStatus } from "@/lib/api";

/**
 * Presentational-only wrapper around status-styles.ts's tone mapping — the
 * behavior (which status maps to which tone/label) lives entirely in that
 * file; this just renders it as a pill, adding a small dot for the
 * "success" tone so a passing status is never conveyed by green text alone.
 */
export function StatusBadge({ status }: { status: TransactionStatus }) {
  const tone = statusTone(status);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-label-sm ${statusBadgeClasses(status)}`}
    >
      {tone === "success" && <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />}
      {statusLabelTh(status)}
    </span>
  );
}
