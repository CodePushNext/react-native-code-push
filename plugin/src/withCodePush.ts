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
const CODE_PUSH_SERVER_URL = "CodePushServerURL";
// Type definitions
type CodePushConfig = {
	ios?: {
		CodePushDeploymentKey?: string;
		CodePushPublicKey?: string;
		CodePushServerURL?: string;
	};
	android?: {
		CodePushDeploymentKey?: string;
		CodePushPublicKey?: string;
		CodePushServerURL?: string;
	};
};

// Interface for string resources
interface StringResources {
	string: Array<{
		$: { name: string };
		_: string;
	}>;
}

// Utility function to add string resource
const addStringResource = (
	resources: StringResources,
	name: string,
	value: string,
) => {
	resources.string = resources.string || [];
	resources.string.push({
		$: { name },
		_: value,
	});
};

// Utility function to add content if not exists
const addContentIfNotExists = (
	contents: string,
	searchString: string,
	importStatement: string,
	beforeString: string,
) => {
	if (!contents.includes(searchString)) {
		return contents.replace(
			beforeString,
			`${beforeString}\n${importStatement}`,
		);
	}
	return contents;
};

const withCodePush: ConfigPlugin<CodePushConfig> = (
	config: ExpoConfig,
	{ ios, android }: CodePushConfig = {},
) => {
	let modifiedConfig = config;

	// Configure iOS Info.plist
	if (
		ios?.CodePushDeploymentKey ||
		ios?.CodePushPublicKey ||
		ios?.CodePushServerURL
	) {
		modifiedConfig = withInfoPlist(modifiedConfig, (config) => {
			const { modResults } = config;
			if (ios.CodePushDeploymentKey) {
				modResults[CODE_PUSH_DEPLOYMENT_KEY] = ios.CodePushDeploymentKey;
			}
			if (ios.CodePushPublicKey) {
				modResults[CODE_PUSH_PUBLIC_KEY] = ios.CodePushPublicKey;
			}
			if (ios.CodePushServerURL) {
				modResults[CODE_PUSH_SERVER_URL] = ios.CodePushServerURL;
			}
			return config;
		});
	}

	// Configure iOS AppDelegate.mm
	if (ios) {
		modifiedConfig = withAppDelegate(modifiedConfig, (config) => {
			config.modResults.contents = addContentIfNotExists(
				config.modResults.contents,
				"#import <CodePush/CodePush.h>",
				"#import <CodePush/CodePush.h>",
				'#import "AppDelegate.h"',
			);

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
	if (
		android?.CodePushDeploymentKey ||
		android?.CodePushPublicKey ||
		android?.CodePushServerURL
	) {
		modifiedConfig = withStringsXml(modifiedConfig, (config) => {
			if (android.CodePushDeploymentKey) {
				addStringResource(
					config.modResults.resources as StringResources,
					CODE_PUSH_DEPLOYMENT_KEY,
					android.CodePushDeploymentKey,
				);
			}
			if (android.CodePushPublicKey) {
				addStringResource(
					config.modResults.resources as StringResources,
					CODE_PUSH_PUBLIC_KEY,
					android.CodePushPublicKey,
				);
			}
			if (android.CodePushServerURL) {
				addStringResource(
					config.modResults.resources as StringResources,
					CODE_PUSH_SERVER_URL,
					android.CodePushServerURL,
				);
			}
			return config;
		});
	}

	// Configure Android MainApplication.java
	if (android) {
		modifiedConfig = withMainApplication(modifiedConfig, (config) => {
			config.modResults.contents = addContentIfNotExists(
				config.modResults.contents,
				"import com.microsoft.codepush.react.CodePush;",
				"import com.microsoft.codepush.react.CodePush",
				"import com.facebook.react.ReactApplication",
			);

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
