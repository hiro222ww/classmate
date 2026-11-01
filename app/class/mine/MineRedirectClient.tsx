"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  HOME_MY_CLASS_SECTION_ID,
  resolveShellDashboardPath,
} from "@/lib/appShellContext";
import { withDev } from "@/lib/withDev";

/**
 * Dedicated /class/mine UI is retired — send users to home マイクラス.
 */
export default function MineRedirectClient() {
  const router = useRouter();

  useEffect(() => {
    const href = `${withDev(resolveShellDashboardPath())}#${HOME_MY_CLASS_SECTION_ID}`;
    router.replace(href);
  }, [router]);

  return (
    <main style={{ padding: 16, fontWeight: 700, color: "#64748b" }}>
      ホームのマイクラスへ移動しています…
    </main>
  );
}
