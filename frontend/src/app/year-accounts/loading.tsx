import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonRows } from "@/components/csmju/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPageHeader />
      <Skeleton className="h-11 w-64" />
      <SkeletonCard />
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-11 w-40" />
        <Skeleton className="h-11 w-40" />
      </div>
      <SkeletonRows count={5} />
    </>
  );
}
