const {
  withAppDelegate,
  withInfoPlist,
  withStringsXml,
  withAppBuildGradle,
  withMainApplication, // Using the safer, higher-level helper
  WarningAggregator,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

//================ iOS (Unchanged) ================
function addImportIOS(content) {
  const lines = content.split('\n');
  const importIndices = lines
    .map((line, idx) => (line.trim().startsWith('import ') || line.trim().startsWith('#import ') ? idx : -1))
    .filter(idx => idx !== -1);
  if (content.includes('import CodePush') || content.includes('#import <CodePush/CodePush.h>')) {
    return content;
  }
  const codePushImport = 'import CodePush';
  if (importIndices.length > 0) {
    const lastImportIdx = importIndices[importIndices.length - 1];
    lines.splice(lastImportIdx + 1, 0, codePushImport);
    return lines.join('\n');
  } else {
    const swiftClassRegex = /class\s+AppDelegate\s*:\s*RCTAppDelegate\s*\{/m;
    if (swiftClassRegex.test(content)) {
        return content.replace(swiftClassRegex, `$&\n${codePushImport}`);
    }
    return codePushImport + '\n' + content;
  }
}

function ensureBundleURLMethodIOS(content) {
  const methodRegexOld = /-\s*\(NSURL\s*\*\s*\)\s*bundleURL\s*\{[^}]*\}/s;
  const methodRegexSwift = /override func bundleURL\(\) -> URL\? \{[^}]*\}/s;
  const newMethodBodyObjC = `- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
#else
  return [CodePush bundleURL];
#endif
}`;
  const newMethodBodySwift = `override func bundleURL() -> URL? {
#if DEBUG
  return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
  return CodePush.bundleURL()
#endif
}`;

  if (methodRegexSwift.test(content)) {
    return content.replace(methodRegexSwift, newMethodBodySwift);
  } else if (methodRegexOld.test(content)) {
    return content.replace(methodRegexOld, newMethodBodyObjC);
  } else {
    const appDelegateEndRegexObjC = /\@end/m;
    const appDelegateEndRegexSwift = /\}\s*$/m;
    if (appDelegateEndRegexObjC.test(content)) {
        return content.replace(appDelegateEndRegexObjC, `\n${newMethodBodyObjC}\n\n@end`);
    } else if (appDelegateEndRegexSwift.test(content)) {
        const lastBraceIndex = content.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
            return content.substring(0, lastBraceIndex) + `\n  ${newMethodBodySwift}\n` + content.substring(lastBraceIndex);
        }
    }
  }
  WarningAggregator.addWarningIOS('codepush-plugin', 'Could not find a suitable place to insert bundleURL() method in AppDelegate.');
  return content;
}

const withCodePushAppDelegate = (config) => {
  return withAppDelegate(config, (config) => {
    let content = config.modResults.contents;
    content = addImportIOS(content);
    content = ensureBundleURLMethodIOS(content);
    config.modResults.contents = content;
    return config;
  });
};

const withCodePushInfoPlist = (config, options = {}) => {
  return withInfoPlist(config, (config) => {
    if (options.ios && options.ios.CodePushDeploymentKey) {
      config.modResults.CodePushDeploymentKey = options.ios.CodePushDeploymentKey;
    }
    if (options.ios && options.ios.CodePushServerURL) {
      config.modResults.CodePushServerURL = options.ios.CodePushServerURL;
    }
    return config;
  });
};

//================ Android (Refactored to use withMainApplication) ================

const withAndroidMainApplication = (config) => {
  return withMainApplication(config, (modConfig) => {
    // Check for Kotlin
    if (modConfig.modResults.language !== 'kt') {
      WarningAggregator.addWarningAndroid(
        'codepush-plugin',
        `The CodePush plugin is skipping modifications to 'MainApplication' because it is not a Kotlin file. Your project must be configured to use Kotlin for Android.`
      );
      return modConfig;
    }

    let content = modConfig.modResults.contents;
    const packageName = config.android.package;

    // --- 1. Add Imports ---
    const requiredImports = [
      'import com.microsoft.codepush.react.CodePush',
      `import ${packageName}.R`,
      'import android.util.Log',
    ];
    // Simple import adder
    const lines = content.split('\n');
    let lastImportIndex = -1;
    const existingImports = new Set();
    lines.forEach((line, index) => {
      if (line.trim().startsWith('import ')) {
        lastImportIndex = index;
        existingImports.add(line.trim());
      }
    });
    const importsToAdd = requiredImports.filter(imp => !existingImports.has(imp));
    if (importsToAdd.length > 0) {
      lines.splice(lastImportIndex + 1, 0, ...importsToAdd);
    }
    content = lines.join('\n');

    // --- 2. Modify onCreate method ---
    const onCreateRegex = /(override fun onCreate\(\)\s*\{)([\s\S]*?)(\n\s*\})/m;
    const onCreateInjection = `
    // CodePush: Initialize instance on app startup.
    try {
        Log.d("CodePushDebug", "Attempting to pre-initialize CodePush in onCreate...");
        val deploymentKey = getString(R.string.CodePushDeploymentKey);
        val isDebugMode = BuildConfig.DEBUG; 
        CodePush.getInstance(deploymentKey, this, isDebugMode);
        Log.d("CodePushDebug", "CodePush.getInstance() called in onCreate()");
    } catch (e: Exception) {
        Log.e("CodePushDebug", "Error pre-initializing CodePush in onCreate: " + e.message, e);
    }
`;
    if (onCreateRegex.test(content) && !content.includes('CodePush.getInstance(deploymentKey, this, isDebugMode)')) {
      content = content.replace(onCreateRegex, (match, onCreateStart, onCreateContent, onCreateEnd) => {
        const soLoaderInitLineRegex = /^\s*SoLoader\.init\(this,.*\)/m;
        const superOnCreateLineRegex = /^\s*super\.onCreate\(\)/m;

        if (soLoaderInitLineRegex.test(onCreateContent)) {
          // Found SoLoader.init(), insert after it
          const modifiedContent = onCreateContent.replace(soLoaderInitLineRegex, `$&${onCreateInjection}`);
          return `${onCreateStart}${modifiedContent}${onCreateEnd}`;
        } else if (superOnCreateLineRegex.test(onCreateContent)) {
          // SoLoader.init() not found, insert after super.onCreate()
          const modifiedContent = onCreateContent.replace(superOnCreateLineRegex, `$&${onCreateInjection}`);
          WarningAggregator.addWarningAndroid('codepush-plugin', 'SoLoader.init() not found in onCreate(). Placing CodePush initialization after super.onCreate().');
          return `${onCreateStart}${modifiedContent}${onCreateEnd}`;
        } else {
          // Neither found, inject at the start of the method
          WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find super.onCreate() or SoLoader.init() in onCreate(). CodePush initialization may be misplaced.');
          return `${onCreateStart}${onCreateInjection}${onCreateContent}${onCreateEnd}`;
        }
      });
    }

    // --- 3. Modify getPackages method ---
    const getPackagesRegex = /override fun getPackages\(\): List<ReactPackage>\s*\{/m;
    const originalPackagesLineRegex = /val\s+packages\s*=\s*PackageList\(this\)\.packages/m;
    const mutablePackagesLine = "val packages: MutableList<ReactPackage> = PackageList(this).packages.toMutableList()";
    const packagesInjection = `
        try {
            val codePushInstance = CodePush.getInstance(getString(R.string.CodePushDeploymentKey), this@MainApplication, BuildConfig.DEBUG);
            if (!packages.contains(codePushInstance)) {
                packages.add(codePushInstance);
                Log.d("CodePushDebug", "CodePush instance added to packages.");
            } else {
                Log.d("CodePushDebug", "CodePush instance was already present in packages list; not adding again.");
            }
        } catch (e: Exception) {
            Log.e("CodePushDebug", "Error adding CodePush to packages list: " + e.message, e);
        }
`;
    if (getPackagesRegex.test(content) && !content.includes('CodePush.getInstance(getString(R.string.CodePushDeploymentKey)')) {
      if (originalPackagesLineRegex.test(content)) {
        content = content.replace(originalPackagesLineRegex, mutablePackagesLine);
        content = content.replace(/(\n\s*return\s+packages)/m, `\n${packagesInjection}$1`);
      } else {
        WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find standard packages list initialization in getPackages(). CodePush package not registered.');
      }
    }

    // --- 4. Add getJSBundleFile method ---
    const getJSBundleFileMethodString = `
    override fun getJSBundleFile(): String {
        return CodePush.getJSBundleFile()
    }`;
    const hermesEnabledAnchor = /(override\s+val\s+isHermesEnabled:\s*Boolean\s*=\s*BuildConfig\.IS_HERMES_ENABLED)\s*\n/m;

    if (!content.includes("override fun getJSBundleFile(): String")) {
      if (hermesEnabledAnchor.test(content)) {
        content = content.replace(hermesEnabledAnchor, `$1\n${getJSBundleFileMethodString}\n`);
      } else {
        WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find `isHermesEnabled` property to anchor `getJSBundleFile()` insertion. Please review `MainApplication.kt`.');
      }
    }
    
    modConfig.modResults.contents = content;
    return modConfig;
  });
};

const withAndroidGradle = (config) => {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language === 'groovy') {
      let content = modConfig.modResults.contents;
      const codePushApplyLine = 'apply from: "../../node_modules/@code-push-next/react-native-code-push/android/codepush.gradle"';
      if (!content.includes(codePushApplyLine)) {
        content += `\n${codePushApplyLine}\n`;
      }

      const androidBlockRegex = /(android\s*\{[\s\S]*?\n\})/m;
      if (androidBlockRegex.test(content)) {
        let androidBlockContent = content.match(androidBlockRegex)[0];
        const buildTypesRegex = /buildTypes\s*\{([\s\S]*?)\n\s*\}/m;
        
        const debugConfigFieldLine = 'buildConfigField "boolean", "DEBUG", "true"';
        const releaseConfigFieldLine = 'buildConfigField "boolean", "DEBUG", "false"';
        const indent = '            '; 

        const modifyBuildType = (buildTypesStr, blockName, fieldToAdd) => {
          const blockRegex = new RegExp(`${blockName}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, "m");
          if (blockRegex.test(buildTypesStr)) {
            return buildTypesStr.replace(blockRegex, (match, group1) => {
              if (group1.includes(fieldToAdd.trim())) return match;
              let lines = group1.trim().split('\n').filter(Boolean);
              lines.push(fieldToAdd.trim());
              const newInnerContent = lines.map(l => `${indent}${l}`).join('\n');
              return `${blockName} {\n${newInnerContent}\n        }`;
            });
          } else {
            return `${buildTypesStr.trim()}\n        ${blockName} {\n${indent}${fieldToAdd.trim()}\n        }`;
          }
        };

        if (buildTypesRegex.test(androidBlockContent)) {
          androidBlockContent = androidBlockContent.replace(buildTypesRegex, (match, group1) => {
            let innerBuildTypes = group1;
            innerBuildTypes = modifyBuildType(innerBuildTypes, "debug", debugConfigFieldLine);
            innerBuildTypes = modifyBuildType(innerBuildTypes, "release", releaseConfigFieldLine);
            return `buildTypes {\n${innerBuildTypes.trim()}\n    }`;
          });
        } else {
          androidBlockContent = androidBlockContent.replace(/\n\s*\}\s*$/, `\n    buildTypes {\n        debug {\n${indent}${debugConfigFieldLine.trim()}\n        }\n        release {\n${indent}${releaseConfigFieldLine.trim()}\n        }\n    }\n}`);
        }
        content = content.replace(androidBlockRegex, androidBlockContent);
      } else {
        WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find android { ... } block in app/build.gradle.');
      }
      
      const reactBlockRegex = /react\s*\{([\s\S]*?)\n\s*\}/m;
      const bundleAssetNameLine = 'bundleAssetName = "main.jsbundle"';
      if (reactBlockRegex.test(content)) {
        content = content.replace(reactBlockRegex, (match, inner) => {
          if (inner.includes('bundleAssetName')) {
            return match.replace(/bundleAssetName\s*=\s*["'].*["']/, bundleAssetNameLine);
          }
          return `react {\n${inner.trim()}\n    ${bundleAssetNameLine}\n}`;
        });
      } else {
        WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find react { ... } block in app/build.gradle.');
      }

      modConfig.modResults.contents = content;
    }
    return modConfig;
  });
};

const withAndroidStrings = (config, options) => {
  return withStringsXml(config, (config) => {
    if (!config.modResults.resources) config.modResults.resources = {};
    if (!config.modResults.resources.string) config.modResults.resources.string = [];
    const strings = config.modResults.resources.string;

    const setString = (name, value) => {
      const existing = strings.find(s => s.$.name === name);
      if (existing) {
        existing._ = value;
      } else {
        strings.push({$: { name, translatable: 'false' }, _: value });
      }
    };
    if (options.android?.CodePushDeploymentKey) {
      setString('CodePushDeploymentKey', options.android.CodePushDeploymentKey);
    }
    if (options.android?.CodePushServerURL) {
      setString('CodePushServerUrl', options.android.CodePushServerURL);
    }
    return config;
  });
};

// --- CORRECTED EXPORT BLOCK ---
module.exports = (config, options = {}) => {
  if (!options) options = {};
  
  if (options.ios) {
    config = withCodePushAppDelegate(config, options);
    config = withCodePushInfoPlist(config, options);
  }
  
  if (options.android) {
    config = withAndroidStrings(config, options); 
    // Correctly call the wrapper functions we defined
    config = withAndroidMainApplication(config);
    config = withAndroidGradle(config); 
  }
  return config;
};
