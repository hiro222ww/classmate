import AuthenticationServices
import Capacitor
import UIKit

/// Google OAuth を ASWebAuthenticationSession で開き、classmate:// へ戻す。
@objc(ClassmateOAuthPlugin)
public class ClassmateOAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "ClassmateOAuthPlugin"
    public let jsName = "ClassmateOAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startOAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelOAuth", returnType: CAPPluginReturnPromise),
    ]

    private var authSession: ASWebAuthenticationSession?

    @objc func startOAuth(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString) else {
            call.reject("Invalid OAuth URL")
            return
        }

        let scheme = call.getString("callbackScheme") ?? ClassmateURLs.nativeAuthScheme

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            self.authSession?.cancel()
            self.authSession = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: scheme
            ) { [weak self] callbackURL, error in
                defer { self?.authSession = nil }

                if let error = error as NSError? {
                    if error.domain == ASWebAuthenticationSessionError.errorDomain,
                       error.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        call.resolve(["cancelled": true])
                        return
                    }
                    call.reject(error.localizedDescription)
                    return
                }

                guard let callbackURL else {
                    call.reject("No callback URL")
                    return
                }

                call.resolve([
                    "callbackUrl": callbackURL.absoluteString,
                    "cancelled": false,
                ])
            }

            self.authSession?.presentationContextProvider = self
            self.authSession?.prefersEphemeralWebBrowserSession = false

            if self.authSession?.start() != true {
                self.authSession = nil
                call.reject("Failed to start OAuth session")
            }
        }
    }

    @objc func cancelOAuth(_ call: CAPPluginCall) {
        authSession?.cancel()
        authSession = nil
        call.resolve()
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = bridge?.viewController?.view.window {
            return window
        }

        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}
