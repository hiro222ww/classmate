import Capacitor
import UIKit

/// Capacitor WebView を包む iOS 専用ルート。Web 本番 UI には一切手を入れない。
final class RootContainerViewController: UIViewController {
    private var bridgeViewController: CAPBridgeViewController!
    private let settingsButton = UIButton(type: .system)
    private var webURLObservation: NSKeyValueObservation?
    private var webURLObserverRetryCount = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        embedBridge()
        configureSettingsButton()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        presentMicPrimerOnLaunchIfNeeded()
        attachWebURLObserverIfNeeded()
    }

    deinit {
        webURLObservation?.invalidate()
    }

    private func embedBridge() {
        bridgeViewController = CAPBridgeViewController()
        addChild(bridgeViewController)
        bridgeViewController.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bridgeViewController.view)
        NSLayoutConstraint.activate([
            bridgeViewController.view.topAnchor.constraint(equalTo: view.topAnchor),
            bridgeViewController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            bridgeViewController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bridgeViewController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        bridgeViewController.didMove(toParent: self)
    }

    private func configureSettingsButton() {
        var config = UIButton.Configuration.gray()
        config.image = UIImage(systemName: "gearshape.fill")
        config.cornerStyle = .capsule
        settingsButton.configuration = config
        settingsButton.translatesAutoresizingMaskIntoConstraints = false
        settingsButton.accessibilityLabel = "アプリ設定"
        settingsButton.addTarget(self, action: #selector(openSettings), for: .touchUpInside)
        view.addSubview(settingsButton)

        NSLayoutConstraint.activate([
            settingsButton.topAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.topAnchor,
                constant: SettingsGearLayout.topInset
            ),
            settingsButton.trailingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.trailingAnchor,
                constant: SettingsGearLayout.trailingInset
            ),
            settingsButton.widthAnchor.constraint(equalToConstant: SettingsGearLayout.size),
            settingsButton.heightAnchor.constraint(equalToConstant: SettingsGearLayout.size),
        ])
    }

    @objc private func openSettings() {
        guard let webView = bridgeViewController?.webView else { return }
        webView.load(URLRequest(url: ClassmateURLs.appSettings))
    }

    // MARK: - Settings gear visibility (iOS only, driven by WebView URL)

    private func attachWebURLObserverIfNeeded() {
        guard webURLObservation == nil else { return }

        guard let webView = bridgeViewController?.webView else {
            guard webURLObserverRetryCount < 20 else { return }
            webURLObserverRetryCount += 1
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
                self?.attachWebURLObserverIfNeeded()
            }
            return
        }

        applySettingsGearVisibility(for: webView.url)

        webURLObservation = webView.observe(\.url, options: [.new]) { [weak self] webView, _ in
            DispatchQueue.main.async {
                self?.applySettingsGearVisibility(for: webView.url)
                self?.presentMicPrimerBeforeCallIfNeeded(webURL: webView.url)
            }
        }
    }

    private func applySettingsGearVisibility(for url: URL?) {
        let show = SettingsGearVisibilityPolicy.shouldShowSettingsGear(for: url)
        settingsButton.isHidden = !show
        settingsButton.isUserInteractionEnabled = show
        if show {
            view.bringSubviewToFront(settingsButton)
        }
    }

    // MARK: - Mic primer (placement swappable via MicPermissionPrimerCoordinator)

    private func presentMicPrimerOnLaunchIfNeeded() {
        guard MicPermissionPrimerCoordinator.shouldPresentOnLaunch() else { return }
        presentMicPrimerModal()
    }

    private func presentMicPrimerBeforeCallIfNeeded(webURL: URL?) {
        guard MicPermissionPrimerCoordinator.shouldPresentBeforeCall(webURL: webURL) else { return }
        guard presentedViewController == nil else { return }
        presentMicPrimerModal()
    }

    private func presentMicPrimerModal() {
        let primer = MicPermissionPrimerCoordinator.makePrimerViewController { [weak self] in
            self?.dismiss(animated: true)
        }
        primer.modalPresentationStyle = .formSheet
        present(primer, animated: true)
    }
}
