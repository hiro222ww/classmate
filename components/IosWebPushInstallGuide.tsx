"use client";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * iOS Safari tabs cannot use Web Push. Guide users to install to Home Screen.
 */
export function IosWebPushInstallGuide({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-web-push-guide-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10050,
        background: "rgba(15, 23, 42, 0.45)",
        display: "grid",
        placeItems: "end center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          borderRadius: 20,
          background: "#fff",
          color: "#111827",
          padding: "20px 18px 16px",
          boxShadow: "0 18px 50px rgba(15, 23, 42, 0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="ios-web-push-guide-title"
          style={{ margin: 0, fontSize: 18, fontWeight: 900 }}
        >
          iPhoneではホーム画面追加が必要です
        </h2>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: 13,
            lineHeight: 1.65,
            color: "#4b5563",
          }}
        >
          Safariのタブではプッシュ通知をオンにできません。iOS 16.4
          以降で、次の手順後にもう一度ベルを押してください。
        </p>

        <ol
          style={{
            margin: "14px 0 0",
            paddingLeft: 20,
            fontSize: 14,
            lineHeight: 1.7,
            fontWeight: 700,
            color: "#111827",
          }}
        >
          <li>画面下の共有ボタン（□↑）をタップ</li>
          <li>「ホーム画面に追加」を選ぶ</li>
          <li>ホーム画面のアイコンから Classmate を開く</li>
          <li>開いた画面でベル（通知）を ON にする</li>
        </ol>

        <p
          style={{
            margin: "12px 0 0",
            fontSize: 12,
            lineHeight: 1.55,
            color: "#6b7280",
          }}
        >
          Chrome などの別ブラウザアプリでは使えません。Safari からホーム画面に追加してください。
        </p>

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #111827",
            background: "#111827",
            color: "#fff",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          わかりました
        </button>
      </div>
    </div>
  );
}
