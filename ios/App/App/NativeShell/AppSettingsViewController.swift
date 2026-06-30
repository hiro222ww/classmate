import UIKit

private struct SettingsRow {
    let title: String
    let subtitle: String?
    let action: () -> Void
}

private struct SettingsSection {
    let title: String
    let rows: [SettingsRow]
}

/// iOS アプリ専用の設定・法務・安全導線。Web 版の通常導線には出さない。
final class AppSettingsViewController: UITableViewController {
    private var sections: [SettingsSection] = []

    init() {
        super.init(style: .insetGrouped)
        title = "アプリ設定"
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .close,
            target: self,
            action: #selector(closeTapped)
        )
        buildSections()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func buildSections() {
        sections = [
            SettingsSection(title: "法務", rows: [
                SettingsRow(title: "利用規約", subtitle: nil) { [weak self] in
                    self?.openWeb(ClassmateURLs.terms)
                },
                SettingsRow(title: "プライバシーポリシー", subtitle: nil) { [weak self] in
                    self?.openWeb(ClassmateURLs.privacy)
                },
                SettingsRow(title: "コミュニティガイドライン", subtitle: nil) { [weak self] in
                    self?.openWeb(ClassmateURLs.guidelines)
                },
            ]),
            SettingsSection(title: "安全", rows: [
                SettingsRow(
                    title: "通報・ブロックについて",
                    subtitle: "ルーム・通話画面から利用できます"
                ) { [weak self] in
                    self?.openWeb(ClassmateURLs.guidelines)
                },
            ]),
            SettingsSection(title: "サポート", rows: [
                SettingsRow(title: "お問い合わせ", subtitle: ClassmateURLs.supportEmail) { [weak self] in
                    SafariLinkPresenter.openMailto(ClassmateURLs.supportMailto)
                    _ = self
                },
                SettingsRow(title: "Classmate について", subtitle: nil) { [weak self] in
                    self?.openWeb(ClassmateURLs.about)
                },
            ]),
            SettingsSection(title: "アカウント", rows: [
                SettingsRow(
                    title: "アカウント設定・ログアウト",
                    subtitle: "アプリ専用の設定画面を開きます"
                ) { [weak self] in
                    self?.openWeb(ClassmateURLs.appSettings)
                },
                SettingsRow(
                    title: "アカウント削除のご依頼",
                    subtitle: "プライバシーポリシーに基づきメールで受付"
                ) { [weak self] in
                    self?.openWeb(ClassmateURLs.privacy)
                },
            ]),
        ]
    }

    @objc private func closeTapped() {
        dismiss(animated: true)
    }

    private func openWeb(_ url: URL) {
        SafariLinkPresenter.open(url, from: self)
    }

    override func numberOfSections(in tableView: UITableView) -> Int {
        sections.count
    }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        sections[section].rows.count
    }

    override func tableView(_ tableView: UITableView, titleForHeaderInSection section: Int) -> String? {
        sections[section].title
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let row = sections[indexPath.section].rows[indexPath.row]
        let cell = UITableViewCell(style: .subtitle, reuseIdentifier: nil)
        cell.textLabel?.text = row.title
        cell.detailTextLabel?.text = row.subtitle
        cell.detailTextLabel?.textColor = .secondaryLabel
        cell.accessoryType = .disclosureIndicator
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        sections[indexPath.section].rows[indexPath.row].action()
    }
}
