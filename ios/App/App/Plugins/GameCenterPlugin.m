#import <Capacitor/Capacitor.h>

CAP_PLUGIN(GameCenterPlugin, "GameCenter",
    CAP_PLUGIN_METHOD(signIn, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(submitScore, CAPPluginReturnPromise);
)
