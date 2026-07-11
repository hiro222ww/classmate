import AppImmersiveChrome from "@/components/app-shell/AppImmersiveChrome";

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppImmersiveChrome>{children}</AppImmersiveChrome>;
}
