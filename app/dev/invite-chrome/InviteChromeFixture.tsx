"use client";

import { useSearchParams } from "next/navigation";
import InviteJoinProgress, {
  type InvitePrepStageId,
} from "@/components/InviteJoinProgress";
import { joinByInviteUserMessage } from "@/lib/joinByInviteTypes";

export type InviteChromeScene =
  | "invite_link"
  | "account"
  | "joining"
  | "opening"
  | "done"
  | "slow"
  | "retry"
  | "expired_invite"
  | "invalid_invite"
  | "class_full"
  | "age_restricted"
  | "needs_profile"
  | "restore_login"
  | "reregister_device"
  | "server_error";

const ERROR_SCENES = new Set<InviteChromeScene>([
  "expired_invite",
  "invalid_invite",
  "class_full",
  "age_restricted",
  "needs_profile",
  "restore_login",
  "reregister_device",
  "server_error",
]);

/**
 * Presentational invite-join chrome for local screenshots.
 * Uses production InviteJoinProgress — no join-by-invite API / DB.
 */
export default function InviteChromeFixture() {
  const searchParams = useSearchParams();
  const scene = (searchParams.get("scene") as InviteChromeScene) || "invite_link";

  const isError = ERROR_SCENES.has(scene);
  const stage: InvitePrepStageId | "done" | "error" | "idle" = isError
    ? "error"
    : scene === "done"
      ? "done"
      : scene === "slow" || scene === "retry"
        ? "joining"
        : (scene as InvitePrepStageId);

  const errorMessage = isError
    ? joinByInviteUserMessage(
        scene as
          | "expired_invite"
          | "invalid_invite"
          | "class_full"
          | "age_restricted"
          | "needs_profile"
          | "restore_login"
          | "reregister_device"
          | "server_error"
      )
    : null;

  return (
    <main
      className="cm-classroom-scope cm-invite-root"
      style={{ maxWidth: 560, margin: "0 auto", padding: 24 }}
    >
      <InviteJoinProgress
        stage={stage}
        classLabel="朝の雑談ルーム"
        inviterName="みどり"
        slow={scene === "slow" || scene === "retry"}
        verySlow={scene === "retry" || isError}
        errorMessage={errorMessage}
        inviteUrl="https://example.local/invite/demo"
        onRetry={() => undefined}
        onCopyInvite={() => undefined}
        onHome={() => undefined}
      />
    </main>
  );
}
