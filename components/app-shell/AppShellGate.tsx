"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isCapacitorNativeApp } from "@/lib/capacitorClient";
import { markAppShellContext } from "@/lib/appShellContext";

type Props = {
  children: React.ReactNode;
};

/**
 * /app/* は Capacitor ネイティブ殻からだけ利用する。
 * 通常 Web ブラウザで直接開いた場合は / へ戻す。
 */
export default function AppShellGate({ children }: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (isCapacitorNativeApp()) {
      markAppShellContext();
      setAllowed(true);
      return;
    }
    setAllowed(false);
    router.replace("/");
  }, [router]);

  if (allowed !== true) {
    return (
      <main className="app-shell">
        <div className="app-shell-inner">
          <p className="app-shell-muted">リダイレクト中…</p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
