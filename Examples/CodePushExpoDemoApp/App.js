import { StatusBar } from 'expo-status-bar';
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import codePush from '@code-push-next/react-native-code-push';

function App() {
  // Log current package information on app start
  useEffect(() => {
    // Add custom error handler
    const originalConsoleError = console.error.bind(console);
    console.error = function (message, ...args) {
      console.log("[CodePushDebug] Error intercepted:", message, ...args);
      return originalConsoleError(message, ...args);
    };

    // Monitor network requests
    const originalFetch = global.fetch;
    global.fetch = function (input, init) {
      console.log("[CodePushDebug] Fetch request to:", typeof input === 'string' ? input : 'Request object');
      return originalFetch(input, init)
        .then(response => {
          console.log("[CodePushDebug] Fetch success for:", typeof input === 'string' ? input : 'Request object');
          return response;
        })
        .catch(error => {
          console.log("[CodePushDebug] Fetch error:", error);
          throw error;
        });
    };

    codePush.getUpdateMetadata().then((metadata) => {
      if (metadata) {
        console.log('[CodePush] Running binary version: ' + metadata.appVersion);
        console.log('[CodePush] Running with CodePush update: ' + metadata.label);
        console.log('[CodePush] Package hash: ' + metadata.packageHash);
        console.log('[CodePush] Package description: ' + metadata.description);
      } else {
        console.log('[CodePush] Running binary version with no CodePush updates installed');
      }

      // After getting metadata, check for updates
      console.log('[CodePush] Checking for update.');
    }).catch(err => {
      console.log('[CodePush] Error getting metadata:', err);
    });
  }, []);

  return (
    <View style={styles.container}>
      <Text>Open up App.js to start working on your app!</Text>
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
