import { SkeletonDetail } from '@/components/Skeleton';

/**
 * Skeleton shown while a page streams in. It mirrors the shared page shape
 * (title, then an optional two-column detail layout) so navigations to the
 * dynamic voucher and clinic routes do not flash a blank canvas.
 */
export default function Loading() {
  return <SkeletonDetail />;
}
