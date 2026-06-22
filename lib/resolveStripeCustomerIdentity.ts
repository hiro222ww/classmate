export type StripeCustomerIdentityMapping = {
  user_id: string | null;
  device_id: string | null;
};

export function resolveStripeCustomerIdentityFromSources(params: {
  metadataUserId?: string | null;
  metadataDeviceId?: string | null;
  mapping?: StripeCustomerIdentityMapping | null;
}): { userId: string | null; deviceId: string | null } {
  let resolvedUserId = String(params.metadataUserId ?? "").trim() || null;
  let resolvedDeviceId = String(params.metadataDeviceId ?? "").trim() || null;

  if ((!resolvedUserId || !resolvedDeviceId) && params.mapping) {
    resolvedUserId = resolvedUserId || params.mapping.user_id || null;
    resolvedDeviceId = resolvedDeviceId || params.mapping.device_id || null;
  }

  return { userId: resolvedUserId, deviceId: resolvedDeviceId };
}
