"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/csmju/ErrorState";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return <ErrorState onRetry={reset} />;
}
