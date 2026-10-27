package com.wirexapp.baas.example

import android.os.Build
import android.os.Process
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlin.concurrent.thread

/**
 * Example-only: what the Config tab's "Share log" needs from the native side — the app and device
 * facts for the report's header, and this process's own logcat lines, where the SDK writes its
 * diagnostics (`logging: 'info'` → tag `WirexSdk`). An app may read its OWN logcat output without
 * `READ_LOGS`; nothing from any other process is returned.
 */
class ExampleDiagnosticsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  override fun getName(): String = NAME

  @ReactMethod
  fun appInfo(promise: Promise) {
    val context = reactApplicationContext
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    @Suppress("DEPRECATION")
    val build = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode.toString() else info.versionCode.toString()
    promise.resolve(
      Arguments.createMap().apply {
        putString("appId", context.packageName)
        putString("version", info.versionName ?: "")
        putString("build", build)
        putString("model", "${Build.MANUFACTURER} ${Build.MODEL}")
        putString("os", "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
      },
    )
  }

  @ReactMethod
  fun nativeLog(promise: Promise) {
    thread(name = "example-diagnostics") {
      try {
        val process = ProcessBuilder("logcat", "-d", "-v", "time", "--pid=${Process.myPid()}")
          .redirectErrorStream(true)
          .start()
        val lines = process.inputStream.bufferedReader().readLines()
        process.waitFor()
        promise.resolve(lines.takeLast(MAX_LINES).joinToString("\n"))
      } catch (e: Exception) {
        promise.resolve("native log unavailable: $e")
      }
    }
  }

  private companion object {
    const val NAME = "ExampleDiagnostics"
    const val MAX_LINES = 4000
  }
}
