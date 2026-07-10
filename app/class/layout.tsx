import AppImmersiveChrome from "@/components/app-shell/AppImmersiveChrome";

export default function ClassLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppImmersiveChrome>{children}</AppImmersiveChrome>;
}
