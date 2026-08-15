import type { Metadata } from "next";
import SettingsClient from "./SettingsClient";
import { SettingsRouteGuard } from "@/components/auth/SettingsRouteGuard";
import { NOINDEX_ROBOTS } from "@/lib/seo";

export const metadata: Metadata = {
  title: "設定",
  robots: NOINDEX_ROBOTS,
};

export default function SettingsPage() {
  return (
    <SettingsRouteGuard>
      <SettingsClient />
    </SettingsRouteGuard>
  );
}
