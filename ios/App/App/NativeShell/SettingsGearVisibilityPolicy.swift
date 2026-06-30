import Foundation

/// iOS ネイティブの ⚙️ 表示方針。Web 本番には一切手を入れない。
enum SettingsGearVisibilityPolicy {
    /// アプリ設定は /app/settings に集約。通話・ルーム等では UI を邪魔しない。
    private static let hiddenPathPrefixes = [
        "/app",
        "/call",
        "/room",
        "/profile",
        "/class",
        "/billing",
        "/premium",
        "/auth",
        "/login",
        "/settings",
        "/terms",
        "/privacy",
        "/guidelines",
        "/legal",
        "/about",
        "/home",
    ]

    static func shouldShowSettingsGear(for url: URL?) -> Bool {
        guard let url else { return false }
        let path = url.path.lowercased()
        if path == "/" { return false }
        return !hiddenPathPrefixes.contains { prefix in
            path == prefix || path.hasPrefix("\(prefix)/")
        }
    }
}

/// ⚙️ の位置調整用。制約の constant を変えるだけで Web に影響しない。
struct SettingsGearLayout {
    static let topInset: CGFloat = 8
    static let trailingInset: CGFloat = -12
    static let size: CGFloat = 44
}
