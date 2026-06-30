import { redirect } from "next/navigation";
import { APP_HOME } from "@/lib/appShell";

export default function AppIndexPage() {
  redirect(APP_HOME);
}
