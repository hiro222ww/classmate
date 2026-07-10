import AppImmersiveChrome from "@/components/app-shell/AppImmersiveChrome";

export default function RoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppImmersiveChrome>{children}</AppImmersiveChrome>;
}
