import SettingsClient from "./SettingsClient";
import { SettingsRouteGuard } from "@/components/auth/SettingsRouteGuard";

export default function SettingsPage() {
  return (
    <SettingsRouteGuard>
      <SettingsClient />
    </SettingsRouteGuard>
  );
}
