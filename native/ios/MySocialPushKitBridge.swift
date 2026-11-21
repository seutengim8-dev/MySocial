import Foundation
import PushKit
import CallKit

/// Starter bridge. Add this file to the generated iOS target and instantiate from AppDelegate.
/// The app must report every received VoIP push to CallKit promptly.
final class MySocialPushKitBridge: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
    private let provider: CXProvider
    private let registry = PKPushRegistry(queue: .main)

    override init() {
        let config = CXProviderConfiguration(localizedName: "MySocial")
        config.supportsVideo = false
        config.maximumCallGroups = 1
        config.maximumCallsPerCallGroup = 1
        self.provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: nil)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
    }

    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(name: .mysocialVoIPToken, object: token)
        // Send this token as `voipToken` to authenticated POST /api/native/register.
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        NotificationCenter.default.post(name: .mysocialVoIPTokenInvalidated, object: nil)
    }

    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        let data = payload.dictionaryPayload
        let callId = data["callId"] as? String ?? UUID().uuidString
        let caller = data["sender"] as? String ?? "MySocial 친구"
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: caller)
        update.localizedCallerName = caller
        update.hasVideo = false
        provider.reportNewIncomingCall(with: UUID(uuidString: callId) ?? UUID(), update: update) { _ in completion() }
    }

    func providerDidReset(_ provider: CXProvider) {}
    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        // TODO: fetch call offer, start native WebRTC audio, then fulfill the action.
        action.fulfill()
    }
    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        // TODO: PATCH /api/calls/:id status=ended or rejected, then stop native audio.
        action.fulfill()
    }
}

extension Notification.Name {
    static let mysocialVoIPToken = Notification.Name("MySocialVoIPToken")
    static let mysocialVoIPTokenInvalidated = Notification.Name("MySocialVoIPTokenInvalidated")
}
