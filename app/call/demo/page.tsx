import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE_NAME, verifyAdminToken } from "@/lib/adminAuth";
import CallDemoClient from "./CallDemoClient";

export const dynamic = "force-dynamic";

export default async function CallDemoPage() {
  const token = (await cookies()).get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminToken(token)) {
    redirect("/admin/login?next=/call/demo");
  }

  return <CallDemoClient />;
}
