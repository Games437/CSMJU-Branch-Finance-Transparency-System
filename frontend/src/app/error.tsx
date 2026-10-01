"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/csmju/ErrorState";

// Route-level error boundary. Never renders `error.message`/stack traces —
// only the generic, pre-approved Thai message (see lib/error-mapping.ts's
// INTERNAL_ERROR entry, which this mirrors for an unexpected render error).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return <ErrorState onRetry={reset} />;
}
