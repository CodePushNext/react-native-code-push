const {
  withAppDelegate,
  withInfoPlist,
  withStringsXml,
  withAppBuildGradle,
  withDangerousMod,
  WarningAggregator, // For logging warnings if patterns aren't found
} = require('@expo/config-plugins');
const fs = require('fs'); // For file system operations
const path = require('path'); // For path operations

//================ iOS  ================
function addImportIOS(content) {
  const lines = content.split('\n');
  const importIndices = lines
    .map((line, idx) => (line.trim().startsWith('import ') || line.trim().startsWith('#import ') ? idx : -1))
    .filter(idx => idx !== -1);

  // Check for existing CodePush import (Swift or Objective-C)
  if (content.includes('import CodePush') || content.includes('#import <CodePush/CodePush.h>')) {
    return content;
  }

  const codePushImport = 'import CodePush'; // Standard for Obj-C

  if (importIndices.length > 0) {
    const lastImportIdx = importIndices[importIndices.length - 1];
    lines.splice(lastImportIdx + 1, 0, codePushImport);
    return lines.join('\n');
  } else {
    // If no imports, try to add after potential Swift class declaration or at top for Obj-C
    const swiftClassRegex = /class\s+AppDelegate\s*:\s*RCTAppDelegate\s*\{/m;
    if (swiftClassRegex.test(content)) {
        return content.replace(swiftClassRegex, `$&\n${codePushImport}`);
    }
    return codePushImport + '\n' + content;
  }
}

function ensureBundleURLMethodIOS(content) {
  const methodRegexOld = /-\s*\(NSURL\s*\*\s*\)\s*bundleURL\s*\{[^}]*\}/s; // Obj-C old style
  const methodRegexSwift = /override func bundleURL\(\) -> URL\? \{[^}]*\}/s; // Swift style

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

  if (methodRegexSwift.test(content)) { // Check for Swift first
    return content.replace(methodRegexSwift, newMethodBodySwift);
  } else if (methodRegexOld.test(content)) { // Then Obj-C
    return content.replace(methodRegexOld, newMethodBodyObjC);
  } else {
    // If method doesn't exist, try to insert it
    const appDelegateEndRegexObjC = /\@end/m;
    const appDelegateEndRegexSwift = /\}\s*$/m; // Last closing brace for Swift

    if (appDelegateEndRegexObjC.test(content)) {
        return content.replace(appDelegateEndRegexObjC, `\n${newMethodBodyObjC}\n\n@end`);
    } else if (appDelegateEndRegexSwift.test(content)) {
        // For Swift, find the last brace of the class
        const lastBraceIndex = content.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
            return content.substring(0, lastBraceIndex) + `\n  ${newMethodBodySwift}\n` + content.substring(lastBraceIndex);
        }
    }
  }
  WarningAggregator.addWarningIOS('codepush-plugin', 'Could not find a suitable place to insert bundleURL() method in AppDelegate. Please ensure it is correctly patched for CodePush.');
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

//================ Android  ================

function addKotlinImports(content, importsToAdd) {
  const lines = content.split('\n');
  let lastImportIndex = -1;
  const existingImports = new Set();

  lines.forEach((line, index) => {
    if (line.trim().startsWith('import ')) {
      lastImportIndex = index;
      existingImports.add(line.trim());
    }
  });

  const newImports = importsToAdd.filter(imp => !existingImports.has(imp));

  if (newImports.length > 0) {
    if (lastImportIndex !== -1) {
      lines.splice(lastImportIndex + 1, 0, ...newImports);
    } else {
      const packageIndex = lines.findIndex(line => line.trim().startsWith('package '));
      if (packageIndex !== -1) {
        lines.splice(packageIndex + 1, 0, '', ...newImports);
      } else {
        lines.unshift(...newImports);
      }
    }
  }
  return lines.join('\n');
}

const withAndroidMainApplication = (config) => {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const packageName = modConfig.android.package;
      if (!packageName) {
        throw new Error('[codepush-plugin] android.package not defined in app config');
      }

      const packagePath = packageName.replace(/\./g, '/');
      const mainAppPath = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'java', packagePath, 'MainApplication.kt');
      
      if (!fs.existsSync(mainAppPath)) {
        throw new Error(
          `[codepush-plugin] MainApplication.kt not found at ${mainAppPath}\n` +
          'Make sure you have run "npx expo prebuild" first'
        );
      }

      let content = fs.readFileSync(mainAppPath, 'utf-8');

      const requiredImports = [
        'import com.microsoft.codepush.react.CodePush',
        `import ${packageName}.R`,
        'import android.util.Log',
      ];
      content = addKotlinImports(content, requiredImports);
      
      const onCreateRegex = /(override fun onCreate\(\)\s*\{)/m;
      const onCreateInjection = `
    // Assuming SoLoader.init is already present and called after super.onCreate()

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
      if (onCreateRegex.test(content)) {
        const soLoaderInitPattern = /SoLoader\.init\(this,.*\)/m;
        const superOnCreatePattern = /super\.onCreate\(\)/m;

        if (soLoaderInitPattern.test(content)) {
            content = content.replace(soLoaderInitPattern, `$&${onCreateInjection}`); 
        } else if (superOnCreatePattern.test(content)) {
            content = content.replace(superOnCreatePattern, `$&${onCreateInjection}`);
        } else {
            content = content.replace(onCreateRegex, `$1\n    super.onCreate() ${onCreateInjection}`); 
            WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not reliably find SoLoader.init() or super.onCreate() in MainApplication.kt onCreate(). CodePush pre-initialization might be misplaced or super.onCreate() might be missing.');
        }
      } else {
        WarningAggregator.addWarningAndroid('codepush-plugin', 'onCreate() method not found in MainApplication.kt. CodePush pre-initialization skipped.');
      }

      const originalPackagesLineRegex = /val\s+packages\s*=\s*PackageList\(this\)\.packages/m;
      const mutablePackagesLine = "val packages: MutableList<ReactPackage> = PackageList(this).packages.toMutableList()";
      
      const packagesInjection = `
        try {
            Log.d("CodePushDebug", "Attempting to add CodePush to packages in getPackages()...");
            val deploymentKey = getString(R.string.CodePushDeploymentKey);
            val isDebugMode = BuildConfig.DEBUG;
            val codePushInstance = CodePush.getInstance(deploymentKey, this@MainApplication, isDebugMode);
            var alreadyAdded = false;
            for (pkg in packages) { 
                if (pkg.javaClass.name == codePushInstance.javaClass.name) {
                    alreadyAdded = true;
                    break;
                }
            }
            if (!alreadyAdded) {
                packages.add(codePushInstance);
                Log.d("CodePushDebug", "CodePush instance added to packages.");
            } else {
                Log.d("CodePushDebug", "CodePush instance was already present in packages list.");
            }
        } catch (e: Exception) {
            Log.e("CodePushDebug", "Error adding CodePush to packages in getPackages: " + e.message, e);
        }
`;
      if (originalPackagesLineRegex.test(content)) {
        content = content.replace(originalPackagesLineRegex, mutablePackagesLine);
        const returnPackagesRegex = /(\n\s*return\s+packages)/m;
        if (returnPackagesRegex.test(content)) {
          content = content.replace(returnPackagesRegex, `\n${packagesInjection}$1`);
        } else {
          WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find "return packages" after making packages mutable. CodePush package injection skipped.');
        }
      } else {
        const alreadyMutablePackagesLineRegex = /val\s+packages:\s*MutableList<ReactPackage>\s*=\s*PackageList\(this\)\.getPackages\(\)\.toMutableList\(\)/m;
        if (alreadyMutablePackagesLineRegex.test(content)) {
           const returnPackagesRegex = /(\n\s*return\s+packages)/m;
           if (returnPackagesRegex.test(content)) {
               if (!content.includes("CodePush.getInstance(deploymentKey, this@MainApplication, isDebugMode)")) {
                    content = content.replace(returnPackagesRegex, `\n${packagesInjection}$1`);
               }
           } else {
                WarningAggregator.addWarningAndroid('codepush-plugin', 'Packages list is mutable but "return packages" not found. CodePush package injection skipped.');
           }
        } else {
          WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find known packages list initialization pattern in getPackages(). CodePush package injection might be incomplete or misplaced.');
           const returnPackagesRegex = /(\n\s*return\s+packages)/m;
           if (returnPackagesRegex.test(content)) {
               content = content.replace(returnPackagesRegex, `\n${packagesInjection}$1`);
               WarningAggregator.addWarningAndroid('codepush-plugin', 'Injected CodePush package logic before "return packages", but original packages list initialization was not recognized. Manual review of MainApplication.kt getPackages() is advised to ensure "packages" is mutable.');
           }
        }
      }
      
      const getJSBundleFileMethodString = `
    override fun getJSBundleFile(): String {
        return CodePush.getJSBundleFile()
    }`;
      const getJSBundleFileMethodSignature = "override fun getJSBundleFile(): String";

      if (!content.includes(getJSBundleFileMethodSignature)) {
        WarningAggregator.addWarningAndroid('codepush-plugin', `[DEBUG] getJSBundleFile method signature ("${getJSBundleFileMethodSignature}") not found. Attempting to add it.`);
        const anchorRegexes = [
          { name: "isHermesEnabled", regex: /(override\s+val\s+isHermesEnabled:\s*Boolean\s*=\s*BuildConfig\.IS_HERMES_ENABLED)\s*\n/m },
          { name: "isNewArchEnabled", regex: /(override\s+val\s+isNewArchEnabled:\s*Boolean\s*=\s*BuildConfig\.IS_NEW_ARCHITECTURE_ENABLED)\s*\n/m },
          { name: "getUseDeveloperSupport", regex: /(override fun getUseDeveloperSupport\(\):\s*Boolean\s*=\s*BuildConfig\.DEBUG)\s*\n/m },
          { name: "getJSMainModuleName", regex: /(override fun getJSMainModuleName\(\):\s*String\s*=\s*".*?")\s*\n/m },
          { name: "getPackagesEnd", regex: /(override fun getPackages\(\):\s*List<ReactPackage>\s*\{[\s\S]*?\n\s*\})\s*\n/m },
        ];

        let inserted = false;
        for (const anchor of anchorRegexes) {
          if (anchor.regex.test(content)) {
            content = content.replace(anchor.regex, `$1\n${getJSBundleFileMethodString}\n`);
            WarningAggregator.addWarningAndroid('codepush-plugin', `[DEBUG] Added getJSBundleFile method after '${anchor.name}'.`);
            inserted = true;
            break;
          }
        }

        if (!inserted) {
          const defaultHostObjectEndRegex = /(object\s*:\s*DefaultReactNativeHost\s*\([^)]*\)\s*\{)([\s\S]*)(\n\s*\})/;
          if (defaultHostObjectEndRegex.test(content)) {
            content = content.replace(defaultHostObjectEndRegex, (match, objectStart, objectContent, objectEnd) => {
              const indentedMethod = getJSBundleFileMethodString.split('\n').map(line => `    ${line.trim()}`).join('\n').trimStart();
              return `${objectStart}${objectContent.trimEnd()}\n\n${indentedMethod}\n${objectEnd}`;
            });
            WarningAggregator.addWarningAndroid('codepush-plugin', `[DEBUG] Added getJSBundleFile method using defaultHostObjectEndRegex fallback (before closing brace of object).`);
            inserted = true;
          }
        }
        
        if (!inserted) {
            WarningAggregator.addWarningAndroid('codepush-plugin', '[CRITICAL] Could not find a suitable anchor to insert getJSBundleFile() method in MainApplication.kt.');
        }
      } else {
        WarningAggregator.addWarningAndroid('codepush-plugin', `[DEBUG] getJSBundleFile method signature ("${getJSBundleFileMethodSignature}") already found. No changes made to its placement.`);
      }

      fs.writeFileSync(mainAppPath, content);
      return modConfig;
    }
  ]);
};

/**
 * Finds the index of the closing brace '}' that matches the opening brace '{'
 * at the given openBraceIndex.
 * @param {string} str The string to search within.
 * @param {number} openBraceIndex The index of the opening brace.
 * @returns {number} The index of the matching closing brace, or -1 if not found.
 */
function findClosingBraceIndex(str, openBraceIndex) {
    // Assumes str[openBraceIndex] is '{'
    let braceLevel = 1; // Start with 1 because we are looking for the match to the initial brace
    for (let i = openBraceIndex + 1; i < str.length; i++) {
        if (str[i] === '{') {
            braceLevel++;
        } else if (str[i] === '}') {
            braceLevel--;
            if (braceLevel === 0) {
                return i;
            }
        }
    }
    return -1; // Matching brace not found
}

/**
 * Ensures a specific block (e.g., "debug" or "release") exists within parentContent
 * and contains the specified field. If the block or field doesn't exist, they are created.
 * @param {string} parentContent The content string where the block should reside (e.g., inner content of buildTypes).
 * @param {string} blockName The name of the block to find or create (e.g., "debug").
 * @param {string} fieldToAdd The full string of the field to add (e.g., 'buildConfigField "boolean", "DEBUG", "true"').
 * @param {string} fieldLineIndentation Indentation for the fieldToAdd line itself (e.g., "            ").
 * @param {string} blockHeaderIndentation Indentation for the block's header line if it needs to be created (e.g., "        ").
 * @returns {string} The modified parentContent string.
 */
const ensureBlockWithField = (parentContent, blockName, fieldToAdd, fieldLineIndentation, blockHeaderIndentation) => {
    // Regex to find the block header, e.g., "debug {", " release {".
    // Group 1: (^|\n) - Start of string or newline.
    // Group 2: ([\s\t]*) - Indentation of the block's opening line.
    // Group 3: (blockName\s*\{) - The block name followed by an opening brace.
    const blockHeaderRegex = new RegExp('(^|\\n)([\\s\\t]*)(' + blockName + '\\s*\\{)');
    const match = blockHeaderRegex.exec(parentContent);
    const trimmedFieldToAdd = fieldToAdd.trim();

    if (match) { // Block exists
        const actualBlockHeaderIndent = match[2]; // Actual indentation of the "debug {" line for re-indenting closing brace
        
        // Start search for '{' from where the block name (e.g. "debug") was found in the match
        const searchStartForBrace = match.index + match[1].length + match[2].length;
        const openBraceIndex = parentContent.indexOf('{', searchStartForBrace);

        if (openBraceIndex === -1) {
            WarningAggregator.addWarningAndroid('codepush-plugin', `Opening brace for existing block '${blockName}' not found. Skipping modification.`);
            return parentContent;
        }

        const closeBraceIndex = findClosingBraceIndex(parentContent, openBraceIndex);
        if (closeBraceIndex === -1) {
            WarningAggregator.addWarningAndroid('codepush-plugin', `Closing brace for existing block '${blockName}' not found. Skipping modification.`);
            return parentContent;
        }

        // Extract parts of the string
        const contentUptoOpenBrace = parentContent.substring(0, openBraceIndex + 1); // Includes the opening brace `{`
        const blockInnerContent = parentContent.substring(openBraceIndex + 1, closeBraceIndex);
        const contentFromCloseBrace = parentContent.substring(closeBraceIndex); // Includes the closing brace `}` and everything after

        // Check if the field already exists in the block's inner content
        if (blockInnerContent.includes(trimmedFieldToAdd)) {
            return parentContent; // Field already exists, no change needed
        }

        const lineToInsert = `${fieldLineIndentation}${trimmedFieldToAdd}`;
        
        let newInnerContent;
        if (blockInnerContent.trim() === '') {
            // Block is empty or contains only whitespace
            newInnerContent = `\n${lineToInsert}\n${actualBlockHeaderIndent}`; 
        } else {
            // Block has existing content. Add the new field after the existing content.
            newInnerContent = blockInnerContent.trimEnd() + `\n${lineToInsert}\n${actualBlockHeaderIndent}`;
        }
        
        return contentUptoOpenBrace + newInnerContent + contentFromCloseBrace;

    } else { // Block does not exist, create it
        WarningAggregator.addWarningAndroid('codepush-plugin', `Block '${blockName}' not found within its parent. Creating it.`);
        let newBlock = `\n${blockHeaderIndentation}${blockName} {\n`;
        newBlock += `${fieldLineIndentation}${trimmedFieldToAdd}\n`;
        newBlock += `${blockHeaderIndentation}}\n`;
        
        // Append to parentContent. Ensure proper newlines.
        const trimmedParentContent = parentContent.trimEnd();
        return trimmedParentContent + (trimmedParentContent ? '\n' : '') + newBlock.trimStart();
    }
};


const withAndroidGradle = (config) => {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      WarningAggregator.addWarningAndroid('codepush-plugin', 'app/build.gradle is not groovy. Android modifications for buildConfigField skipped.');
      return modConfig;
    }

    let content = modConfig.modResults.contents;

    // Ensure CodePush Gradle script is applied
    const codePushApplyLine = 'apply from: "../../node_modules/@code-push-next/react-native-code-push/android/codepush.gradle"';
    if (!content.includes(codePushApplyLine)) {
      content = content.trimEnd() + `\n\n${codePushApplyLine}\n`;
    }

    // --- Start of buildConfigField modifications ---

    // Find android { ... } block
    const androidBlockHeaderRegex = /^android\s*\{/m; // Matches "android {" at the start of a line
    const androidMatch = content.match(androidBlockHeaderRegex);

    if (!androidMatch) {
      WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find "android {" block in app/build.gradle. Skipping buildConfigField modifications.');
      // Still apply react block changes if any
    } else {
        const androidBlockStartIndex = androidMatch.index;
        const androidOpenBraceIndex = content.indexOf('{', androidBlockStartIndex);

        if (androidOpenBraceIndex === -1) {
            WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find opening brace for "android" block. Skipping buildConfigField modifications.');
        } else {
            const androidCloseBraceIndex = findClosingBraceIndex(content, androidOpenBraceIndex);
            if (androidCloseBraceIndex === -1) {
                WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find closing brace for "android" block. Skipping buildConfigField modifications.');
            } else {
                const androidBlockPrefix = content.substring(0, androidOpenBraceIndex + 1); // e.g. "...android {"
                let androidBlockInnerContent = content.substring(androidOpenBraceIndex + 1, androidCloseBraceIndex);
                const androidBlockSuffix = content.substring(androidCloseBraceIndex); // e.g. "}..."

                // Define fields and their indentations
                const debugField = 'buildConfigField "boolean", "DEBUG", "true"';
                const releaseField = 'buildConfigField "boolean", "DEBUG", "false"';
                
                // Determine typical indentation levels based on common Gradle formatting
                // android {
                //     buildTypes {        // Indent: 4 spaces from android
                //         debug {         // Indent: 8 spaces from android
                //             field       // Indent: 12 spaces from android
                //         }
                //     }
                // }
                // We need the indent of the line where "buildTypes {" would start, and "debug {" would start.
                // This can be tricky if the file has inconsistent indentation. We'll use common defaults.
                // The `ensureBlockWithField` helper will use the *actual* indent of an existing block if found.
                
                const androidBlockLineMatch = content.substring(0, androidBlockStartIndex).match(/\n([\s\t]*)$/);
                const baseIndentForAndroidBlockLine = androidBlockLineMatch ? androidBlockLineMatch[1] : ""; // Indent of the line "android {" itself

                const buildTypesHeaderIndent = baseIndentForAndroidBlockLine + "    "; // For a new "buildTypes {" line
                const debugReleaseHeaderIndent = buildTypesHeaderIndent + "    "; // For a new "debug {" or "release {" line
                const buildConfigFieldLineIndent = debugReleaseHeaderIndent + "    "; // For the "buildConfigField" line

                // Find or create buildTypes { ... } within androidBlockInnerContent
                const buildTypesHeaderRegex = /(^|\n)([\s\t]*)buildTypes\s*\{/m;
                const btMatch = androidBlockInnerContent.match(buildTypesHeaderRegex);

                if (btMatch) {
                    const actualBuildTypesHeaderIndent = btMatch[2]; // Actual indent of "buildTypes {" line
                    const btOpenBraceIndex = androidBlockInnerContent.indexOf('{', btMatch.index + btMatch[0].length -1); // Find '{' in "buildTypes {"
                    
                    if (btOpenBraceIndex === -1) {
                        WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find opening brace for "buildTypes" block. Skipping its modification.');
                    } else {
                        const btCloseBraceIndex = findClosingBraceIndex(androidBlockInnerContent, btOpenBraceIndex);
                        if (btCloseBraceIndex === -1) {
                            WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find closing brace for "buildTypes" block. Skipping its modification.');
                        } else {
                            const btPrefix = androidBlockInnerContent.substring(0, btOpenBraceIndex + 1);
                            let btInnerContent = androidBlockInnerContent.substring(btOpenBraceIndex + 1, btCloseBraceIndex);
                            const btSuffix = androidBlockInnerContent.substring(btCloseBraceIndex);

                            // Indentation for new debug/release blocks if created inside existing buildTypes
                            const actualDebugReleaseHeaderIndent = actualBuildTypesHeaderIndent + "    ";

                            btInnerContent = ensureBlockWithField(btInnerContent, "debug", debugField, buildConfigFieldLineIndent, actualDebugReleaseHeaderIndent);
                            btInnerContent = ensureBlockWithField(btInnerContent, "release", releaseField, buildConfigFieldLineIndent, actualDebugReleaseHeaderIndent);
                            
                            androidBlockInnerContent = btPrefix + btInnerContent + btSuffix;
                        }
                    }
                } else {
                    // buildTypes block does not exist, create it
                    WarningAggregator.addWarningAndroid('codepush-plugin', 'buildTypes block not found in android block. Creating it with debug/release buildConfigFields.');
                    let newBuildTypesBlock = `\n${buildTypesHeaderIndent}buildTypes {\n`;
                    newBuildTypesBlock += `${debugReleaseHeaderIndent}debug {\n${buildConfigFieldLineIndent}${debugField.trim()}\n${debugReleaseHeaderIndent}}\n`;
                    newBuildTypesBlock += `${debugReleaseHeaderIndent}release {\n${buildConfigFieldLineIndent}${releaseField.trim()}\n${debugReleaseHeaderIndent}}\n`;
                    newBuildTypesBlock += `${buildTypesHeaderIndent}}\n`;
                    
                    const trimmedAndroidInner = androidBlockInnerContent.trimEnd();
                    androidBlockInnerContent = trimmedAndroidInner + (trimmedAndroidInner ? '\n' : '') + newBuildTypesBlock.trimStart();
                }
                // Reconstruct the full Gradle content
                content = androidBlockPrefix + androidBlockInnerContent + androidBlockSuffix;
            }
        }
    }
    // --- End of buildConfigField modifications ---


    // --- Modification for react block  ---
    const reactBlockRegex = /react\s*\{([\s\S]*?)\n\s*\}/m;
    const bundleAssetNameLine = '    bundleAssetName = "main.jsbundle"'; 
    const commentedBundleAssetNameRegex = /\/\/\s*bundleAssetName\s*=\s*["'].*?["']/m;
    const uncommentedBundleAssetNameRegex = /^\s*bundleAssetName\s*=\s*["'].*?["']/m; 

    if (reactBlockRegex.test(content)) {
      content = content.replace(reactBlockRegex, (match, reactBlockInnerContent) => {
        let modifiedInnerContent = reactBlockInnerContent;
        if (commentedBundleAssetNameRegex.test(modifiedInnerContent)) {
          modifiedInnerContent = modifiedInnerContent.replace(commentedBundleAssetNameRegex, bundleAssetNameLine);
        } else if (uncommentedBundleAssetNameRegex.test(modifiedInnerContent)) {
          if (!modifiedInnerContent.includes(bundleAssetNameLine.trim())) {
             modifiedInnerContent = modifiedInnerContent.replace(uncommentedBundleAssetNameRegex, bundleAssetNameLine);
          }
        } else {
          const trimmedInnerContent = modifiedInnerContent.trimEnd();
          modifiedInnerContent = `${trimmedInnerContent ? `${trimmedInnerContent}\n` : ''}${bundleAssetNameLine}`;
        }
        const finalInnerLines = modifiedInnerContent.split('\n')
            .map(line => line.trim() ? `    ${line.trim()}` : line.trim()) 
            .filter(line => line.trim().length > 0);
        return `react {\n${finalInnerLines.join('\n')}\n}`;
      });
    } else {
      WarningAggregator.addWarningAndroid('codepush-plugin', 'Could not find react { ... } block in app/build.gradle to set bundleAssetName. Adding a new one.');
      const androidBlockEndRegex = /android\s*\{[\s\S]*?\n\}/m; // Look for the end of the android block
      if(androidBlockEndRegex.test(content)){ // If android block exists, add react block after it
        content = content.replace(androidBlockEndRegex, `$& \n\nreact {\n${bundleAssetNameLine}\n}`);
      } else { // Otherwise, append to the end of the file
        content = content.trimEnd() + `\n\nreact {\n${bundleAssetNameLine}\n}\n`;
      }
    }
    // --- End of react block modification ---

    modConfig.modResults.contents = content;
    return modConfig;
  });
};


const withAndroidStrings = (config, options) => {
  return withStringsXml(config, (config) => {
    if (!config.modResults.resources) {
      config.modResults.resources = {};
    }
    if (!config.modResults.resources.string) {
      config.modResults.resources.string = [];
    }
    const strings = config.modResults.resources.string;

    if (options.android && options.android.CodePushDeploymentKey) {
      const existingKey = strings.find(s => s.$.name === 'CodePushDeploymentKey');
      if (existingKey) {
        existingKey._ = options.android.CodePushDeploymentKey;
      } else {
        strings.push({
          $: { name: 'CodePushDeploymentKey', translatable: 'false' },
          _: options.android.CodePushDeploymentKey,
        });
      }
    }

    if (options.android && options.android.CodePushServerURL) {
      const existingUrl = strings.find(s => s.$.name === 'CodePushServerURL');
      if (existingUrl) {
        existingUrl._ = options.android.CodePushServerURL;
      } else {
        strings.push({
          $: { name: 'CodePushServerUrl', translatable: 'false' },
          _: options.android.CodePushServerURL,
        });
      }
    }
    return config;
  });
};

module.exports = (config, options = {}) => {
  if (!options) options = {};

  if (options.ios) {
    config = withCodePushAppDelegate(config, options);
    config = withCodePushInfoPlist(config, options);
  }

  if (options.android) {
    config = withAndroidStrings(config, options); 
    config = withAndroidMainApplication(config); 
    config = withAndroidGradle(config);      
  }
  return config;
};
