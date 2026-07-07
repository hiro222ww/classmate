"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_SETTINGS } from "@/lib/appShell";
import { isAppShellContext } from "@/lib/appShellContext";
import { withDev } from "@/lib/withDev";

/** Web /settings からアプリ文脈のユーザーを /app/settings へ寄せる */
export function SettingsRouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!isAppShellContext()) return;
    router.replace(withDev(APP_SETTINGS));
  }, [router]);

  if (isAppShellContext()) {
    return <p style={{ padding: 24 }}>読み込み中…</p>;
  }

  return <>{children}</>;
}
