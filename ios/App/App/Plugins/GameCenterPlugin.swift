import Foundation
import GameKit
import Capacitor

/// Thin wrapper around GameKit for sign-in + leaderboard score submission.
/// Written in-house instead of pulling a third-party Capacitor plugin:
/// GameKit's surface for this (authenticate + submit score) is ~2 calls,
/// and the community package (@openforge/capacitor-apple-game-center)
/// pins @capacitor/core ^4.0.0 while this project is on ^6.1.2 -
/// two major versions of Capacitor's native plugin API apart, with the
/// package itself unmaintained for a year+ (single release). Not worth
/// the compatibility risk for this little surface area.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin {

    @objc func signIn(_ call: CAPPluginCall) {
        let localPlayer = GKLocalPlayer.local
        localPlayer.authenticateHandler = { viewController, error in
            if let viewController = viewController {
                // GameKit wants to present its own sign-in sheet.
                DispatchQueue.main.async {
                    self.bridge?.viewController?.present(viewController, animated: true)
                }
                return
            }
            if let error = error {
                call.reject("Game Center authentication failed", nil, error)
                return
            }
            call.resolve([
                "isAuthenticated": localPlayer.isAuthenticated,
                "playerId": localPlayer.gamePlayerID
            ])
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Not signed in to Game Center")
            return
        }
        guard let leaderboardId = call.getString("leaderboardId") else {
            call.reject("leaderboardId is required")
            return
        }
        let score = call.getInt("score", 0)

        Task {
            do {
                try await GKLeaderboard.submitScore(
                    score,
                    context: 0,
                    player: GKLocalPlayer.local,
                    leaderboardIDs: [leaderboardId]
                )
                call.resolve(["success": true])
            } catch {
                call.reject("Failed to submit score", nil, error)
            }
        }
    }
}
