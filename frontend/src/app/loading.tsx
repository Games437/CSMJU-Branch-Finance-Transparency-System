import { SkeletonCard, SkeletonPageHeader } from "@/components/csmju/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPageHeader />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </>
  );
}
