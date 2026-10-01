import { SkeletonPageHeader, SkeletonRows } from "@/components/csmju/Skeleton";

export default function Loading() {
  return (
    <>
      <SkeletonPageHeader />
      <SkeletonRows count={4} />
    </>
  );
}
