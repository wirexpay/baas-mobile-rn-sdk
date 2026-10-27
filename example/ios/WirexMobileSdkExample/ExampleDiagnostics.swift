import Foundation
import OSLog
import React
import UIKit

/// Example-only: what the Config tab's "Share log" needs from the native side — the app and device
/// facts for the report's header, and this process's own unified-log entries, where the SDK writes
/// its diagnostics (`logging: 'info'` → os_log). `OSLogStore(scope: .currentProcessIdentifier)` reads
/// nothing from any other process.
@objc(ExampleDiagnostics)
final class ExampleDiagnostics: NSObject {

  @objc func appInfo(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let bundle = Bundle.main
    resolve([
      "appId": bundle.bundleIdentifier ?? "",
      "version": bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "",
      "build": bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "",
      "model": Self.machine(),
      "os": "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
    ])
  }

  @objc func nativeLog(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .utility).async {
      resolve(Self.collect())
    }
  }

  /// The hardware identifier (`iPhone14,5`), which is what a bug report wants; the marketing name is
  /// not available to an app.
  private static func machine() -> String {
    var info = utsname()
    uname(&info)
    let mirror = Mirror(reflecting: info.machine)
    let identifier = mirror.children.reduce(into: "") { result, element in
      guard let value = element.value as? Int8, value != 0 else { return }
      result.append(String(UnicodeScalar(UInt8(value))))
    }
    return identifier.isEmpty ? UIDevice.current.model : identifier
  }

  private static let clock: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm:ss.SSS"
    return formatter
  }()

  /// When this process started, from the kernel: the native log is read from here, not from boot.
  static func processStart() -> Date {
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.stride
    var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
    guard sysctl(&mib, 4, &info, &size, nil, 0) == 0 else { return Date().addingTimeInterval(-3600) }
    let start = info.kp_proc.p_un.__p_starttime
    return Date(timeIntervalSince1970: TimeInterval(start.tv_sec) + TimeInterval(start.tv_usec) / 1_000_000)
  }

  /// This process's log entries since it started: the SDK's own (a `com.wirexapp` subsystem), capped
  /// to the last 4000. Other entries are left out unless they are errors or faults.
  private static func collect() -> String {
    do {
      let store = try OSLogStore(scope: .currentProcessIdentifier)
      let position = store.position(date: Self.processStart())
      let entries = try store.getEntries(at: position).compactMap { $0 as? OSLogEntryLog }
      let wirex = entries.filter {
        $0.subsystem.range(of: "wirex", options: .caseInsensitive) != nil || $0.level == .error || $0.level == .fault
      }
      if wirex.isEmpty { return "(no SDK entry and no error in the unified log this run; \(entries.count) system entries omitted)" }
      let chosen = wirex.suffix(4000)
      let lines = chosen.map { "\(clock.string(from: $0.date)) \($0.subsystem)/\($0.category): \($0.composedMessage)" }
      let note = "(\(wirex.count) SDK entries of \(entries.count))"
      return ([note] + lines).joined(separator: "\n")
    } catch {
      return "native log unavailable: \(error)"
    }
  }
}
