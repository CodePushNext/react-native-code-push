// `@expo/metro-runtime` MUST be the first import to ensure Fast Refresh works
// on web.
import '@expo/metro-runtime';

import { renderRootComponent } from 'expo-router/build/renderRootComponent';



import { App } from "expo-router/build/qualified-entry";
import codePush from "@code-push-next/react-native-code-push";

const codePushOptions = {
	checkFrequency: codePush.CheckFrequency.ON_APP_START,
	installMode: codePush.InstallMode.ON_NEXT_RESTART,
};

renderRootComponent(codePush(codePushOptions)(App));
