import { secondaryButtonClass } from "./ui";

interface Props {
  message?: string;
  onRetry?: () => void;
}

const DEFAULT_MESSAGE =
  "ระบบขัดข้องชั่วคราว กรุณาลองอีกครั้ง หากยังพบปัญหา กรุณาแจ้งผู้ดูแลระบบ";

/**
 * Generic full-block error state. `message` must already be a mapped, safe
 * Thai message (see lib/error-mapping.ts) — this component never receives
 * or renders a raw error.message/stack trace.
 */
export function ErrorState({ message, onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-error-container bg-error-container/40 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error-container">
        <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-on-error-container" aria-hidden="true">
          <path
            d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A1 1 0 003 19.5h18a1 1 0 00.89-1.46L13.71 3.86a1 1 0 00-1.72 0z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="max-w-sm text-body-md text-on-surface">{message ?? DEFAULT_MESSAGE}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${secondaryButtonClass} mt-2`}>
          ลองอีกครั้ง
        </button>
      )}
    </div>
  );
}
