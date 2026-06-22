export type AuthRestoreLogPayload = {
  phase: string;
  userId?: string | null;
  deviceId?: string | null;
  email?: string | null;
  linked?: boolean;
  anonymous?: boolean;
  profileMigrated?: boolean;
  entitlementsLinked?: boolean;
  billingLinked?: boolean;
  matchPrefsLinked?: boolean;
  error?: string | null;
  redirectTo?: string | null;
};

export function logAuthRestore(payload: AuthRestoreLogPayload) {
  const parts = [
    `[auth-restore] phase=${payload.phase}`,
    payload.userId ? `userId=${payload.userId}` : null,
    payload.deviceId ? `deviceId=${payload.deviceId}` : null,
    payload.email ? `email=${payload.email}` : null,
    payload.linked != null ? `linked=${payload.linked}` : null,
    payload.anonymous != null ? `anonymous=${payload.anonymous}` : null,
    payload.profileMigrated != null
      ? `profileMigrated=${payload.profileMigrated}`
      : null,
    payload.entitlementsLinked != null
      ? `entitlementsLinked=${payload.entitlementsLinked}`
      : null,
    payload.billingLinked != null ? `billingLinked=${payload.billingLinked}` : null,
    payload.matchPrefsLinked != null
      ? `matchPrefsLinked=${payload.matchPrefsLinked}`
      : null,
    payload.error ? `error=${payload.error}` : null,
    payload.redirectTo ? `redirectTo=${payload.redirectTo}` : null,
  ].filter(Boolean);

  console.log(parts.join(" "));
}
