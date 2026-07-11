"use client";

import { usePathname } from "next/navigation";
import { isAppShellContext } from "@/lib/appShellContext";
import { isImmersiveShellPath } from "@/lib/immersiveShellPaths";
import {
  APP_IMMERSIVE_LAYOUT_CSS,
  APP_SHELL_LAYOUT_CSS,
} from "@/components/app-shell/appShellStyles";

export default function AppImmersiveChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const immersive = isAppShellContext() && isImmersiveShellPath(pathname);

  if (!immersive) {
    return <>{children}</>;
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `${APP_SHELL_LAYOUT_CSS}\n${APP_IMMERSIVE_LAYOUT_CSS}`,
        }}
      />
      <div className="app-shell app-immersive">{children}</div>
    </>
  );
}
