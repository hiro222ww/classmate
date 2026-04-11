import { redirect } from "next/navigation";

export default async function ClassPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const devRaw = sp.dev;
  const dev =
    typeof devRaw === "string"
      ? devRaw
      : Array.isArray(devRaw)
        ? devRaw[0] ?? ""
        : "";

  if (dev) {
    redirect(`/class/select?dev=${encodeURIComponent(dev)}`);
  }

  redirect("/class/select");
}