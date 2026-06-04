"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { installAppLifecycle, logAppLifeRoute } from "@/lib/appLifecycle";

export default function AppLifecycleBoot() {
  const pathname = usePathname();
  const prevPathRef = useRef<string>("");

  useEffect(() => installAppLifecycle(), []);

  useEffect(() => {
    const search =
      typeof window !== "undefined" ? window.location.search : "";
    const path = `${pathname ?? ""}${search}`;

    if (prevPathRef.current && prevPathRef.current !== path) {
      logAppLifeRoute(prevPathRef.current, path, "next-pathname");
    }
    prevPathRef.current = path;
  }, [pathname]);

  return null;
}
