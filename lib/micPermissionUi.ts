import { detectInAppBrowser } from "@/lib/inAppBrowser";

export type MicErrorCategory =
  | "permission_denied"
  | "device_unavailable"
  | "device_busy"
  | "security"
  | "constraint"
  | "aborted"
  | "unknown";

export type MicErrorGuidance = {
  category: MicErrorCategory;
  errorName: string;
  title: string;
  body: string;
  permissionDenied: boolean;
  showInAppBrowserHint: boolean;
};

function readErrorName(error: unknown): string {
  if (error instanceof DOMException) return error.name;
  if (error instanceof Error) return error.name || "Error";
  return "unknown";
}

function readErrorMessage(error: unknown): string {
  if (error instanceof DOMException) return error.message;
  if (error instanceof Error) return error.message;
  return String(error ?? "unknown");
}

export function classifyMicError(error: unknown): MicErrorGuidance {
  const errorName = readErrorName(error);
  const inApp = detectInAppBrowser();
  const inAppSuffix = inApp.detected
    ? " LINEなどのアプリ内ブラウザでは動作しない場合があります。SafariまたはChromeで開いてください。"
    : "";

  if (
    errorName === "NotAllowedError" ||
    errorName === "PermissionDeniedError"
  ) {
    return {
      category: "permission_denied",
      errorName,
      title: "マイクが許可されていません",
      body:
        "ブラウザまたは端末の設定から、マイクの使用を許可してください。" +
        inAppSuffix,
      permissionDenied: true,
      showInAppBrowserHint: inApp.detected,
    };
  }

  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return {
      category: "device_unavailable",
      errorName,
      title: "マイクが見つかりません",
      body:
        "マイクが見つからない、または他のアプリで使用中の可能性があります。別の通話アプリを閉じてから、もう一度お試しください。",
      permissionDenied: false,
      showInAppBrowserHint: false,
    };
  }

  if (errorName === "NotReadableError") {
    return {
      category: "device_busy",
      errorName,
      title: "マイクを利用できません",
      body:
        "マイクが他のアプリで使用中の可能性があります。別の通話アプリを閉じてから、もう一度お試しください。",
      permissionDenied: false,
      showInAppBrowserHint: false,
    };
  }

  if (errorName === "SecurityError") {
    return {
      category: "security",
      errorName,
      title: "マイクを利用できません",
      body:
        "このブラウザではマイク通話が制限されています。SafariまたはChromeで開き直してください。",
      permissionDenied: false,
      showInAppBrowserHint: true,
    };
  }

  if (errorName === "OverconstrainedError") {
    return {
      category: "constraint",
      errorName,
      title: "マイク設定を確認してください",
      body: "選択したマイクが利用できません。別のマイクを選ぶか、もう一度お試しください。",
      permissionDenied: false,
      showInAppBrowserHint: false,
    };
  }

  if (errorName === "AbortError") {
    return {
      category: "aborted",
      errorName,
      title: "マイク取得が中断されました",
      body: "もう一度お試しください。",
      permissionDenied: false,
      showInAppBrowserHint: false,
    };
  }

  return {
    category: "unknown",
    errorName,
    title: "マイク取得に失敗しました",
    body: `もう一度お試しください。${inAppSuffix}`.trim(),
    permissionDenied: false,
    showInAppBrowserHint: inApp.detected,
  };
}

export function formatMicErrorLog(error: unknown): {
  name: string;
  message: string;
} {
  return {
    name: readErrorName(error),
    message: readErrorMessage(error).slice(0, 120),
  };
}

export async function queryMicrophonePermissionState(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unsupported";
  }
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state;
  } catch {
    return "error";
  }
}
