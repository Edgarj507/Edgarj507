#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers GameCenterPlugin.swift with Capacitor's JS bridge as
// window.Capacitor.Plugins.GameCenter
CAP_PLUGIN(GameCenterPlugin, "GameCenter",
  CAP_PLUGIN_METHOD(signIn, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(submitScore, CAPPluginReturnPromise);
)
