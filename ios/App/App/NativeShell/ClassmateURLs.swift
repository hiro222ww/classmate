import Foundation

/// Web 本番 URL と iOS アプリ専用の導線定数。
/// Web 版のルートや UI は変更せず、ネイティブ設定画面から参照する。
enum ClassmateURLs {
    static let productionBase = "https://classmate-room.com"
    static let nativeAuthScheme = "classmate"

    static let appHome = URL(string: "\(productionBase)/app/home")!
    static let appSettings = URL(string: "\(productionBase)/app/settings")!

    static let terms = URL(string: "\(productionBase)/terms")!
    static let privacy = URL(string: "\(productionBase)/privacy")!
    static let guidelines = URL(string: "\(productionBase)/guidelines")!
    static let about = URL(string: "\(productionBase)/about")!
    static let settings = appSettings

    static let supportEmail = "classmate.app.team@gmail.com"
    static var supportMailto: URL {
        URL(string: "mailto:\(supportEmail)?subject=Classmate%20iOS%20お問い合わせ")!
    }
}

enum ClassmateUserDefaultsKeys {
    static let micPrimerShown = "classmate_ios_mic_primer_shown"
}
