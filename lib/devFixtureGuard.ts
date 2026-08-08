import { notFound } from "next/navigation";

type EnvLike = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  ALLOW_DEV_FIXTURES?: string;
};

/**
 * Dev-only visual fixtures under /dev/* must never ship to end users.
 */
export function isDevFixtureAllowed(env: EnvLike = process.env): boolean {
  return (
    env.NODE_ENV !== "production" &&
    env.VERCEL_ENV !== "production" &&
    env.ALLOW_DEV_FIXTURES !== "0"
  );
}

/** Call from Server Components at the top of /dev/* fixture pages. */
export function assertDevFixtureAllowed(): void {
  if (!isDevFixtureAllowed()) {
    notFound();
  }
}

export const DEV_FIXTURE_ROBOTS = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
} as const;
