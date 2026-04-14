// plugins/with-firebase-sdk-version.js
// Fixes two issues that arise when combining:
//   - @react-native-firebase/* (needs Firebase iOS SDK 11.x)
//   - expo-firebase-recaptcha → expo-firebase-core (pins Firebase 9.5.0)
//   - useFrameworks: "static" (required by Firebase)
//
// 1. expo-firebase-core exposes a `$FirebaseSDKVersion` global so the pin
//    can be overridden. We force it to 11.15.0 to match RNFBApp.
// 2. @react-native-firebase needs `$RNFirebaseAsStaticFramework = true`
//    under static frameworks, or its framework modules import non-modular
//    React headers and fail to compile.
// 3. As a final safety net, flip `CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_
//    FRAMEWORK_MODULES` to YES across all pod targets via post_install.

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FIREBASE_SDK_VERSION = '11.15.0';
const TOP_MARKER = '# --- injected by with-firebase-sdk-version.js (top) ---';
const POST_INSTALL_MARKER = '# --- injected by with-firebase-sdk-version.js (post_install) ---';

const topInjection = `${TOP_MARKER}
$FirebaseSDKVersion = '${FIREBASE_SDK_VERSION}'
$RNFirebaseAsStaticFramework = true

`;

// Wraps the existing post_install block so we can apply build-setting
// fixes to every pod target after react_native_post_install has run.
//
// Three fixes applied:
//   1. CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES: allow
//      framework modules to #import non-modular headers (React headers
//      aren't framework-modular).
//   2. For RNFB* targets, disable clang modules entirely — otherwise
//      clang's strict module verification fails because RNFBApp claims
//      ownership of RCTBridgeModule and RNFBAppCheck's transitive
//      imports trip "must be imported from module X" errors. RNFB is
//      pure Obj-C; it doesn't need modules.
//   3. Disable warnings-as-errors on RNFB targets as a final safety net.
const postInstallInjection = `
    ${POST_INSTALL_MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        if target.name.start_with?('RNFB')
          config.build_settings['CLANG_ENABLE_MODULES'] = 'NO'
          config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS'] = 'NO'
          config.build_settings['OTHER_CFLAGS'] = '$(inherited) -fno-modules'
        end
      end
    end
`;

const withFirebaseSDKVersion = (config) => {
    return withDangerousMod(config, [
        'ios',
        async (config) => {
            const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
            if (!fs.existsSync(podfilePath)) return config;

            let contents = fs.readFileSync(podfilePath, 'utf8');

            // 1 + 2: inject globals at the top.
            if (!contents.includes(TOP_MARKER)) {
                contents = topInjection + contents;
            }

            // 3: inject the build-setting override into the post_install block.
            if (!contents.includes(POST_INSTALL_MARKER)) {
                // Find the closing of react_native_post_install(...)
                const marker = 'react_native_post_install(';
                const markerIdx = contents.indexOf(marker);
                if (markerIdx !== -1) {
                    // Walk forward to find the matching closing paren, then
                    // inject right after it.
                    let depth = 0;
                    let i = markerIdx + marker.length;
                    while (i < contents.length) {
                        const ch = contents[i];
                        if (ch === '(') depth++;
                        else if (ch === ')') {
                            if (depth === 0) {
                                // end of react_native_post_install(...)
                                // find the end of this line
                                const lineEnd = contents.indexOf('\n', i);
                                const insertAt = lineEnd === -1 ? contents.length : lineEnd + 1;
                                contents =
                                    contents.slice(0, insertAt) +
                                    postInstallInjection +
                                    contents.slice(insertAt);
                                break;
                            }
                            depth--;
                        }
                        i++;
                    }
                }
            }

            fs.writeFileSync(podfilePath, contents);
            return config;
        },
    ]);
};

module.exports = withFirebaseSDKVersion;
