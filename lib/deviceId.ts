export function getOrCreateDeviceId(): string {
  const key = "device_id"; // ★これに統一
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function getDeviceId(): string | null {
  return localStorage.getItem("device_id");
}
