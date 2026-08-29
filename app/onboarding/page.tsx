import { Suspense } from "react";
import { MinProfileOnboardingClient } from "./MinProfileOnboardingClient";

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <MinProfileOnboardingClient />
    </Suspense>
  );
}
