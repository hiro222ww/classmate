const REFRESH_FLAG_KEY = "classmate_refresh_joined_classes";
const REFRESH_CLASS_ID_KEY = "classmate_refresh_joined_class_id";

export function markJoinedClassesStale(classId?: string) {
  if (typeof window === "undefined") return;

  sessionStorage.setItem(REFRESH_FLAG_KEY, String(Date.now()));

  if (classId) {
    sessionStorage.setItem(REFRESH_CLASS_ID_KEY, classId);
  }
}

export function consumeJoinedClassesRefresh(): {
  pending: boolean;
  classId: string | null;
} {
  if (typeof window === "undefined") {
    return { pending: false, classId: null };
  }

  const pending = Boolean(sessionStorage.getItem(REFRESH_FLAG_KEY));
  const classId = String(sessionStorage.getItem(REFRESH_CLASS_ID_KEY) ?? "").trim();

  if (pending) {
    sessionStorage.removeItem(REFRESH_FLAG_KEY);
    sessionStorage.removeItem(REFRESH_CLASS_ID_KEY);
  }

  return {
    pending,
    classId: pending && classId ? classId : null,
  };
}

export function peekJoinedClassesRefresh(): {
  pending: boolean;
  classId: string | null;
} {
  if (typeof window === "undefined") {
    return { pending: false, classId: null };
  }

  const pending = Boolean(sessionStorage.getItem(REFRESH_FLAG_KEY));
  const classId = String(sessionStorage.getItem(REFRESH_CLASS_ID_KEY) ?? "").trim();

  return {
    pending,
    classId: pending && classId ? classId : null,
  };
}
