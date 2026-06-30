import AVFoundation
import UIKit

/// システムのマイク許可ダイアログの前に表示する説明画面（App Store 審査向け）。
final class MicPermissionPrimerViewController: UIViewController {
    var onContinue: (() -> Void)?

    private let titleLabel = UILabel()
    private let bodyLabel = UILabel()
    private let continueButton = UIButton(type: .system)
    private let skipButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        configureViews()
    }

    private func configureViews() {
        titleLabel.text = "マイクの使用について"
        titleLabel.font = .boldSystemFont(ofSize: 22)
        titleLabel.numberOfLines = 0

        bodyLabel.text = """
        Classmate の音声通話ではマイクを使用します。
        通話を始める前に、iOS の許可ダイアログが表示されます。
        拒否した場合は「設定」アプリから Classmate のマイクをオンにできます。
        """
        bodyLabel.font = .systemFont(ofSize: 16)
        bodyLabel.textColor = .secondaryLabel
        bodyLabel.numberOfLines = 0

        continueButton.setTitle("続ける", for: .normal)
        continueButton.titleLabel?.font = .boldSystemFont(ofSize: 17)
        continueButton.backgroundColor = .label
        continueButton.setTitleColor(.systemBackground, for: .normal)
        continueButton.layer.cornerRadius = 12
        continueButton.contentEdgeInsets = UIEdgeInsets(top: 14, left: 20, bottom: 14, right: 20)
        continueButton.addTarget(self, action: #selector(handleContinue), for: .touchUpInside)

        skipButton.setTitle("あとで", for: .normal)
        skipButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        skipButton.addTarget(self, action: #selector(handleSkip), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [titleLabel, bodyLabel, continueButton, skipButton])
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            stack.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
        ])
    }

    @objc private func handleContinue() {
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] _ in
            DispatchQueue.main.async {
                self?.onContinue?()
            }
        }
    }

    @objc private func handleSkip() {
        onContinue?()
    }
}
