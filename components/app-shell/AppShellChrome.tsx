"use client";

import { APP_SHELL_LAYOUT_CSS } from "@/components/app-shell/appShellStyles";

/** /app 配下専用の見た目。ルート layout のフッターは CSS で非表示にする。 */
export default function AppShellChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `${APP_SHELL_LAYOUT_CSS}\nbody > footer { display: none !important; }`,
        }}
      />
      <div className="app-shell">{children}</div>
    </>
  );
}
