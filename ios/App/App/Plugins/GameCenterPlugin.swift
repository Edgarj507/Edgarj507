import Foundation
import Capacitor
import GameKit

@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin {

    @objc func signIn(_ call: CAPPluginCall) {
        let localPlayer = GKLocalPlayer.local
        localPlayer.authenticateHandler = { [weak self] (viewController, error) in
            if let vc = viewController, let rootVC = self?.bridge?.viewController {
                rootVC.present(vc, animated: true, completion: nil)
                call.resolve()
            } else if localPlayer.isAuthenticated {
                call.resolve()
            } else {
                call.reject(error?.localizedDescription ?? "Authentication failed")
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Player not authenticated")
            return
        }

        guard let leaderboardId = call.getString("leaderboardId"),
              let score = call.getInt("score") else {
            call.reject("Missing leaderboardId or score")
            return
        }

        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [leaderboardId]) { error in
            if let err = error {
                call.reject(err.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }
}
