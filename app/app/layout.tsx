import type { Metadata } from "next";
import AppShellChrome from "@/components/app-shell/AppShellChrome";
import AppShellGate from "@/components/app-shell/AppShellGate";
import { NOINDEX_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Classmate",
  robots: NOINDEX_ROBOTS,
};

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShellGate>
      <AppShellChrome>{children}</AppShellChrome>
    </AppShellGate>
  );
}
