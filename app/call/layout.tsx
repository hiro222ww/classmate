import AppImmersiveChrome from "@/components/app-shell/AppImmersiveChrome";

export default function CallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppImmersiveChrome>{children}</AppImmersiveChrome>;
}
