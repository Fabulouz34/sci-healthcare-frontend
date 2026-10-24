import type { Meta, StoryObj } from '@storybook/nextjs';

import { Skeleton, SkeletonCard, SkeletonDetail, SkeletonRow } from './Skeleton';

const meta: Meta = {
  title: 'UI/Skeleton',
};

export default meta;

export const BaseSkeleton: StoryObj = {
  render: () => (
    <div className="space-y-3 p-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-10 w-full max-w-sm" />
    </div>
  ),
};

export const ListRows: StoryObj = {
  render: () => (
    <div className="space-y-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </div>
  ),
};

export const Cards: StoryObj = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  ),
};

export const DetailPage: StoryObj = {
  render: () => <SkeletonDetail />,
};
