"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { withDev } from "@/lib/withDev";

type PageBackLinkProps = {
  /** Fallback when history cannot go back (e.g. deep link). */
  fallbackHref?: string;
  label?: string;
  className?: string;
};

/**
 * Prefer browser history back; fall back to a home (or other) link.
 * Keeps SPA navigation working with the browser back button.
 */
export function PageBackLink({
  fallbackHref = "/",
  label = "戻る",
  className = "cm-page-back-link",
}: PageBackLinkProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
          return;
        }
        router.push(withDev(fallbackHref));
      }}
    >
      <span aria-hidden>‹</span>
      {label}
    </button>
  );
}

export function PageHomeLink({
  label = "ホーム",
  className = "cm-page-back-link",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Link href={withDev("/")} className={className} aria-label={label}>
      <span aria-hidden>‹</span>
      {label}
    </Link>
  );
}
