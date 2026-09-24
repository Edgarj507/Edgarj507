import Foundation
import Capacitor
import StoreKit

@objc(ContinuePurchasePlugin)
public class ContinuePurchasePlugin: CAPPlugin {
    private let productId = "com.edgarj507.kaijublocks.continue"

    @objc func getPrice(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.resolve(["priceString": "$0.29"])
                    return
                }
                call.resolve(["priceString": product.displayPrice])
            } catch {
                call.resolve(["priceString": "$0.29"])
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Product not found")
                    return
                }

                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        call.resolve(["success": true])
                    case .unverified(_, _):
                        call.reject("Transaction unverified")
                    }
                case .userCancelled:
                    call.resolve(["success": false, "error": "cancelled"])
                case .pending:
                    call.reject("Transaction pending")
                @unknown default:
                    call.reject("Unknown error")
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
