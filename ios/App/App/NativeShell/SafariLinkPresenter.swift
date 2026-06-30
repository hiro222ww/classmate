import SafariServices
import UIKit

enum SafariLinkPresenter {
    static func open(_ url: URL, from presenter: UIViewController) {
        let safari = SFSafariViewController(url: url)
        safari.dismissButtonStyle = .close
        presenter.present(safari, animated: true)
    }

    static func openMailto(_ url: URL) {
        UIApplication.shared.open(url)
    }
}
