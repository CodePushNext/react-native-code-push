import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import codePush from '@code-push-next/react-native-code-push';

function App() {
  return (
    <View style={styles.container}>
      <Text>Open up App.js to start working on your app updated 2!</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// CodePush configuration (remains the same as your original file)
const codePushOptions = {
  checkFrequency: codePush.CheckFrequency.ON_APP_START,
  installMode: codePush.InstallMode.IMMEDIATE,
  mandatoryInstallMode: codePush.InstallMode.IMMEDIATE,
  updateDialog: {
    appendReleaseDescription: true,
    title: "Update Available",
    descriptionPrefix: "\n\nRelease Notes:\n",
    mandatoryContinueButtonLabel: "Install Now",
    mandatoryUpdateMessage: "An update is available that must be installed.",
    optionalIgnoreButtonLabel: "Later",
    optionalInstallButtonLabel: "Install Now",
    optionalUpdateMessage: "An update is available. Would you like to install it?"
  }
};

export default codePush(codePushOptions)(App);
