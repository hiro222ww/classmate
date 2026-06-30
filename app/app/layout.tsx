import type { Metadata } from "next";
import AppShellChrome from "@/components/app-shell/AppShellChrome";
import AppShellGate from "@/components/app-shell/AppShellGate";

export const metadata: Metadata = {
  title: "Classmate",
  robots: {
    index: false,
    follow: false,
  },
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
