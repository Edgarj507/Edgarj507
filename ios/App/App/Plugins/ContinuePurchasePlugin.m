#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers ContinuePurchasePlugin.swift with Capacitor's JS bridge as
// window.Capacitor.Plugins.ContinuePurchase
CAP_PLUGIN(ContinuePurchasePlugin, "ContinuePurchase",
  CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getPrice, CAPPluginReturnPromise);
)
