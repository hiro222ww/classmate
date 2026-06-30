import Foundation

/// iOS ネイティブの ⚙️ 表示方針。Web 本番には一切手を入れない。
enum SettingsGearVisibilityPolicy {
    /// Call / Room では Web 右上操作と重なりやすいため非表示。
    private static let hiddenPathPrefixes = ["/call", "/room"]

    static func shouldShowSettingsGear(for url: URL?) -> Bool {
        guard let url else { return true }
        let path = url.path.lowercased()
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
