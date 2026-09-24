import Foundation
import StoreKit
import Capacitor

/// Bridges the JS "continue after game over" paywall to a real StoreKit2
/// consumable purchase. Apple requires IAP (not a web payment) for any
/// digital in-app content — see App Store Review Guideline 3.1.1.
@objc(ContinuePurchasePlugin)
public class ContinuePurchasePlugin: CAPPlugin {
    // Must match the consumable product ID configured in App Store Connect
    // (and in Configuration.storekit for local sandbox testing).
    private let continueProductId = "com.edgarj507.kaijublocks.continue"
    private var cachedProduct: Product?

    @objc func getPrice(_ call: CAPPluginCall) {
        Task {
            do {
                let product = try await loadProduct()
                call.resolve(["priceString": product.displayPrice])
            } catch {
                call.reject("Failed to load continue product", nil, error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        Task {
            do {
                let product = try await loadProduct()
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        call.resolve(["success": true])
                    case .unverified(_, let error):
                        call.resolve(["success": false, "error": "unverified: \(error.localizedDescription)"])
                    }
                case .userCancelled:
                    call.resolve(["success": false, "error": "cancelled"])
                case .pending:
                    // e.g. Ask to Buy / parental approval in flight — not a hard failure.
                    call.resolve(["success": false, "error": "pending"])
                @unknown default:
                    call.resolve(["success": false, "error": "unknown"])
                }
            } catch {
                call.reject("Purchase failed", nil, error)
            }
        }
    }

    private func loadProduct() async throws -> Product {
        if let cached = cachedProduct { return cached }
        let products = try await Product.products(for: [continueProductId])
        guard let product = products.first else {
            throw NSError(
                domain: "ContinuePurchase",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey:
                    "Product \(continueProductId) not found — configure it in App Store Connect (or Configuration.storekit for local testing)"]
            )
        }
        cachedProduct = product
        return product
    }
}
