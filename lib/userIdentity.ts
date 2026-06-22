export const USER_ID_CACHE_KEY = "classmate_user_id";

export type UserIdentity = {
  userId: string;
  deviceId: string;
  isAnonymous: boolean;
  hasLinkedEmail: boolean;
  email: string | null;
};

export type AuthSessionStatus = {
  ok: boolean;
  userId: string;
  deviceId: string;
  isAnonymous: boolean;
  hasLinkedEmail: boolean;
  email: string | null;
  profileMigrated: boolean;
  entitlementsLinked: boolean;
};

export function isValidUuid(value: unknown): value is string {
  const s = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

export function readBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

export function pickDeviceIdFromRequest(
  req: Request,
  bodyDeviceId?: unknown
): string {
  const fromHeader = String(req.headers.get("x-device-id") ?? "").trim();
  if (fromHeader) return fromHeader;
  return String(bodyDeviceId ?? "").trim();
}

export function hasLinkedEmailFromAuthUser(user: {
  email?: string | null;
  is_anonymous?: boolean | null;
}): boolean {
  if (user.is_anonymous) return false;
  return Boolean(String(user.email ?? "").trim());
}

export function anonymousUserNotice(isAnonymous: boolean, hasLinkedEmail: boolean) {
  if (!isAnonymous && hasLinkedEmail) return null;
  if (isAnonymous) {
    return "ゲスト利用中です。別端末やブラウザでも同じアカウントを使うには、アカウント連携を行ってください。";
  }
  return "メール連携が未完了です。確認メールをご確認ください。";
}
