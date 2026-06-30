import UIKit

/// マイク説明の表示タイミング。Web 変更なしで iOS 側だけ切り替え可能。
enum MicPermissionPrimerPlacement {
    /// 現状: 初回起動時（RootContainer.viewDidAppear）
    case onFirstLaunch
    /// 将来: WebView が /call に遷移した直前（URL 監視でトリガー）
    case beforeFirstCall
}

enum MicPermissionPrimerCoordinator {
    static var placement: MicPermissionPrimerPlacement = .onFirstLaunch

    static var hasShownPrimer: Bool {
        UserDefaults.standard.bool(forKey: ClassmateUserDefaultsKeys.micPrimerShown)
    }

    static func markPrimerShown() {
        UserDefaults.standard.set(true, forKey: ClassmateUserDefaultsKeys.micPrimerShown)
    }

    /// 起動時表示（placement == .onFirstLaunch のときのみ）
    static func shouldPresentOnLaunch() -> Bool {
        guard placement == .onFirstLaunch else { return false }
        return !hasShownPrimer
    }

    /// 将来: /call 遷移検知時（placement == .beforeFirstCall のときのみ）
    static func shouldPresentBeforeCall(webURL: URL?) -> Bool {
        guard placement == .beforeFirstCall, !hasShownPrimer else { return false }
        guard let path = webURL?.path.lowercased() else { return false }
        return path == "/call" || path.hasPrefix("/call/")
    }

    static func makePrimerViewController(onFinish: @escaping () -> Void) -> MicPermissionPrimerViewController {
        let primer = MicPermissionPrimerViewController()
        primer.onContinue = {
            markPrimerShown()
            onFinish()
        }
        return primer
    }
}
