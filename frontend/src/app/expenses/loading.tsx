import { SkeletonCard, SkeletonPageHeader, SkeletonRows } from "@/components/csmju/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPageHeader />
      <SkeletonCard />
      <SkeletonRows count={4} />
    </>
  );
}
