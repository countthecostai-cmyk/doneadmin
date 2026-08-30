import { SkeletonDetailHeader, SkeletonLines, SkeletonPage } from "@/components/Skeleton";

export default function AdminUserDetailLoading() {
  return (
    <SkeletonPage>
      <div className="space-y-6">
        <SkeletonDetailHeader />
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <SkeletonLines count={4} />
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <SkeletonLines count={3} />
        </div>
      </div>
    </SkeletonPage>
  );
}
