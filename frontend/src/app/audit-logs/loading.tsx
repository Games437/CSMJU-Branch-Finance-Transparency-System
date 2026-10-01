import { Skeleton, SkeletonPageHeader, SkeletonRows } from "@/components/csmju/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-11 w-40" />
        <Skeleton className="h-11 w-52" />
      </div>
      <SkeletonRows count={5} />
    </>
  );
}
