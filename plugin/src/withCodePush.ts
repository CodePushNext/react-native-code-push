import {
	type ConfigPlugin,
	withAndroidManifest,
	withInfoPlist,
	withProjectBuildGradle,
	withStringsXml,
	withAppBuildGradle,
	withAppDelegate,
	withMainApplication,
	createRunOncePlugin,
} from "@expo/config-plugins";
import type { ExpoConfig } from "@expo/config-types";
const pkg = require("../../package.json");

// Constants
const CODE_PUSH_DEPLOYMENT_KEY = "CodePushDeploymentKey";
const CODE_PUSH_PUBLIC_KEY = "CodePushPublicKey";

// Type definitions
type CodePushConfig = {
	ios?: {
		CodePushDeploymentKey?: string;
		CodePushPublicKey?: string;
	};
	android?: {
		CodePushDeploymentKey?: string;
		CodePushPublicKey?: string;
	};
};

const withCodePush: ConfigPlugin<CodePushConfig> = (
	config: ExpoConfig,
	{ ios, android }: CodePushConfig = {},
) => {
	let modifiedConfig = config;

	// Configure iOS Info.plist
	if (ios?.CodePushDeploymentKey || ios?.CodePushPublicKey) {
		modifiedConfig = withInfoPlist(modifiedConfig, (config) => {
			if (ios.CodePushDeploymentKey) {
				config.modResults[CODE_PUSH_DEPLOYMENT_KEY] = ios.CodePushDeploymentKey;
			}
			if (ios.CodePushPublicKey) {
				config.modResults[CODE_PUSH_PUBLIC_KEY] = ios.CodePushPublicKey;
			}
			return config;
		});
	}

	// Configure iOS AppDelegate.mm
	if (ios) {
		modifiedConfig = withAppDelegate(modifiedConfig, (config) => {
			// Add CodePush import
			if (
				!config.modResults.contents.includes("#import <CodePush/CodePush.h>")
			) {
				config.modResults.contents = config.modResults.contents.replace(
					`#import "AppDelegate.h"`,
					`#import "AppDelegate.h"
#import <CodePush/CodePush.h>`,
				);
			}

			// Modify bundleURL method
			if (!config.modResults.contents.includes("CodePush.bundleURL")) {
				config.modResults.contents = config.modResults.contents.replace(
					'return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];',
					"return [CodePush bundleURL];",
				);
			}

			return config;
		});
	}

	// Android strings.xml
	if (android?.CodePushDeploymentKey || android?.CodePushPublicKey) {
		modifiedConfig = withStringsXml(modifiedConfig, (config) => {
			// Add CodePush deployment key
			if (android.CodePushDeploymentKey) {
				config.modResults.resources.string =
					config.modResults.resources.string || [];
				config.modResults.resources.string.push({
					$: {
						name: CODE_PUSH_DEPLOYMENT_KEY,
					},
					_: android.CodePushDeploymentKey,
				});
			}

			// Add CodePush public key
			if (android.CodePushPublicKey) {
				config.modResults.resources.string =
					config.modResults.resources.string || [];
				config.modResults.resources.string.push({
					$: {
						name: CODE_PUSH_PUBLIC_KEY,
					},
					_: android.CodePushPublicKey,
				});
			}

			return config;
		});
	}

	// Configure Android MainApplication.java
	if (android) {
		modifiedConfig = withMainApplication(modifiedConfig, (config) => {
			// Add CodePush import
			if (
				!config.modResults.contents.includes(
					"import com.microsoft.codepush.react.CodePush;",
				)
			) {
				config.modResults.contents = config.modResults.contents.replace(
					"import com.facebook.react.ReactApplication",
					`import com.facebook.react.ReactApplication
import com.microsoft.codepush.react.CodePush`,
				);
			}

			// Add CodePush.getJSBundleFile() override method
			if (
				!config.modResults.contents.includes(
					"override fun getJSBundleFile(): String",
				)
			) {
				config.modResults.contents = config.modResults.contents.replace(
					"override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED",
					`override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED

          override fun getJSBundleFile(): String {
             return CodePush.getJSBundleFile() 
           }`,
				);
			}
			return config;
		});
	}

	// Configure Android app build.gradle
	if (android) {
		modifiedConfig = withAppBuildGradle(modifiedConfig, (config) => {
			const codePushImplementation = `apply from: new File(["node", "--print", "require.resolve('@code-push-next/react-native-code-push/package.json')"].execute(null, rootDir).text.trim()).getParentFile().getAbsolutePath() + "/android/codepush.gradle"`;

			if (!config.modResults.contents.includes(codePushImplementation)) {
				const reactApplyPlugin = `apply plugin: "com.facebook.react"`;
				if (config.modResults.contents.includes(reactApplyPlugin)) {
					config.modResults.contents = config.modResults.contents.replace(
						reactApplyPlugin,
						`${reactApplyPlugin}\n${codePushImplementation}`,
					);
				}
			}

			return config;
		});
	}

	return modifiedConfig;
};

export default createRunOncePlugin(withCodePush, pkg.name, pkg.version);
