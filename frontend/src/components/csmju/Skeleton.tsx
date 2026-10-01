export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-container ${className}`} aria-hidden="true" />;
}

/** A skeleton approximating a card with a title, a big number, and two stat lines. */
export function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <Skeleton className="mb-2 h-9 w-40" />
      <Skeleton className="mb-4 h-3 w-24" />
      <div className="grid grid-cols-2 gap-3 border-t border-outline-variant/40 pt-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}

/** A skeleton approximating a list of expandable rows (expenses/approvals/audit rows). */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-sm"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** A skeleton approximating a page's title + description block. */
export function SkeletonPageHeader() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}
