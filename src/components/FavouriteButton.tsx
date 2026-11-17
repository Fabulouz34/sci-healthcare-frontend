'use client';

import { toggleFavouriteClinic, useIsClinicFavourite } from '@/lib/favourites';

/**
 * Star button for favouriting a clinic (#feat-favourite-clinics).
 * Stored in localStorage with graceful fallback when storage is disabled.
 */
export function FavouriteButton({
  address,
  clinicName,
  className = '',
}: {
  address: string;
  clinicName?: string;
  className?: string;
}) {
  const isFavourite = useIsClinicFavourite(address);

  const label = isFavourite
    ? `Remove ${clinicName ?? 'clinic'} from favourites`
    : `Add ${clinicName ?? 'clinic'} to favourites`;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isFavourite}
      title={isFavourite ? 'Favourited' : 'Add to favourites'}
      onClick={(e) => {
        // Prevent triggering parent Link click if nested or event bubbling
        e.preventDefault();
        e.stopPropagation();
        toggleFavouriteClinic(address);
      }}
      className={`inline-flex items-center justify-center rounded-lg border border-[var(--color-line)] bg-white p-2 text-[var(--color-ink-soft)] transition hover:bg-[var(--color-canvas)] hover:text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] max-sm:min-h-11 max-sm:min-w-11 ${className}`}
    >
      <svg
        aria-hidden="true"
        className={`h-5 w-5 transition-colors ${
          isFavourite ? 'fill-amber-400 text-amber-400' : 'fill-none text-current'
        }`}
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}
