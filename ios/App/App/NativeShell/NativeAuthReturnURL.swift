import Foundation

extension Notification.Name {
    /// Custom URL Scheme で OAuth が戻ったとき。object は本番 Web の callback URL。
    static let classmateNativeAuthReturn = Notification.Name("classmateNativeAuthReturn")
}

/// classmate://auth/callback → https://classmate-room.com/auth/callback
enum NativeAuthReturnURL {
    static func webCallbackURL(from nativeURL: URL) -> URL? {
        guard nativeURL.scheme == ClassmateURLs.nativeAuthScheme else { return nil }

        let isAuthCallback =
            (nativeURL.host == "auth" && nativeURL.path == "/callback") ||
            nativeURL.path == "/auth/callback"
        guard isAuthCallback else { return nil }

        var components = URLComponents()
        components.scheme = "https"
        components.host = URL(string: ClassmateURLs.productionBase)?.host ?? "classmate-room.com"
        components.path = "/auth/callback"
        components.percentEncodedQuery = nativeURL.query
        components.fragment = nativeURL.fragment
        return components.url
    }

    static func postWebCallbackIfNeeded(from nativeURL: URL) {
        guard let webURL = webCallbackURL(from: nativeURL) else { return }
        NotificationCenter.default.post(
            name: .classmateNativeAuthReturn,
            object: webURL
        )
    }
}
