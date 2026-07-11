import AppImmersiveChrome from "@/components/app-shell/AppImmersiveChrome";

export default function PremiumLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppImmersiveChrome>{children}</AppImmersiveChrome>;
}
