# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Most of our native dependencies ship their own consumer rules inside their
# AARs, so they need nothing here: expo-modules-core (keeps Module subclasses,
# Record/Enumerable/SharedObject types and ExpoView constructors, all of which
# are resolved reflectively), expo (+ -image, -location, -notifications),
# react-native-reanimated, react-native-worklets, react-native-svg, React
# Native itself (@ReactModule / @ReactMethod / @DoNotStrip), Firebase and
# Play Services / ML Kit. Only add rules below for gaps in that coverage.

# Keep crash reports readable. R8 strips line numbers by default, which turns
# every Crashlytics/Play Console stack trace into unusable frames. These two
# preserve them while still allowing class/method names to be obfuscated; the
# mapping file (app/build/outputs/mapping/release/mapping.txt) must be uploaded
# to Play so the traces get symbolicated. EAS uploads it automatically.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Reflection and generics metadata. Kotlin-based Expo modules read generic
# signatures to coerce JS arguments into typed Kotlin parameters, and both
# Firebase and the JS-side Firestore SDK's native bridges read annotations.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# react-native-reanimated / react-native-worklets: the JNI layer looks these up
# by name from C++, so name-based obfuscation breaks the worklet runtime.
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Build-time-only annotations referenced by okhttp/okio (bundled with React
# Native) that are absent at runtime. Without these, R8 fails the build on
# missing-class errors rather than warning.
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.**
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# Add any project specific keep options here:
