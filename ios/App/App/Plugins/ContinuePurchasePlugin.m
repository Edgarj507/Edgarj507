#import <Capacitor/Capacitor.h>

CAP_PLUGIN(ContinuePurchasePlugin, "ContinuePurchase",
    CAP_PLUGIN_METHOD(getPrice, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
)
