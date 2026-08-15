import type { Metadata } from "next";
import AppImmersiveChrome from "@/components/app-shell/AppImmersiveChrome";
import { NOINDEX_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppImmersiveChrome>{children}</AppImmersiveChrome>;
}
