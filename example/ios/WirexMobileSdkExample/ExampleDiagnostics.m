#import <React/RCTBridgeModule.h>

// Example-only bridge for the Swift `ExampleDiagnostics` module (see ExampleDiagnostics.swift).
@interface RCT_EXTERN_MODULE(ExampleDiagnostics, NSObject)

RCT_EXTERN_METHOD(appInfo:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(nativeLog:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
