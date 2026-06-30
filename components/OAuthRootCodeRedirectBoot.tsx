"use client";

import { useEffect } from "react";
import { redirectOAuthCodeFromRootIfNeeded } from "@/lib/oauthRootRedirect";

/** Supabase が /?code=... に戻した場合、/auth/callback へ転送する（保険） */
export default function OAuthRootCodeRedirectBoot() {
  useEffect(() => {
    redirectOAuthCodeFromRootIfNeeded();
  }, []);

  return null;
}
