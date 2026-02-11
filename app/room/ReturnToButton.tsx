// app/room/ReturnToButton.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ReturnToButton() {
  const router = useRouter();
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    // ✅ ここはクライアントだけで動く。SSRに影響しない。
    try {
      const v =
        localStorage.getItem("classmate_last_room_url") ||
        localStorage.getItem("classmate_last_class_url") ||
        "";
      setHref(v || null);
    } catch {
      setHref(null);
    }
  }, []);

  // ✅ SSR時 / 初回CSR時 は null を返す → HTMLが一致して hydration 失敗しない
  if (!href) return null;

  return (
    <button
      onClick={() => router.push(href)}
      style={{
        padding: "12px 16px",
        borderRadius: 12,
        border: "1px solid #ddd",
        background: "#f2f2f2",
        color: "#111",
        fontWeight: 900,
        cursor: "pointer",
      }}
    >
      元のクラスへ戻る
    </button>
  );
}
