This is a [**React Native Expo**](https://docs.expo.dev/) project, created using the command `npx create-expo-app@latest --template blank`. The App.js file was then modified to add codepush functionality. An expo plugin was added for codepush in `codepush-plugin.js` and is configure in app.json

# Testing Codepush functionality

## Step 1: Set Codepush Server and Codepush Deployment key in app.json

In app.json set `CodePushDeploymentKey` and `CodePushServerURL` for ios and android. 

## Step 2: Run expo prebuild

run `npx expo prebuild --clean`

## Step 3: Create release bundle 

### Android

run `cd android && ./gradlew assembleRelease` 

The apk bundle will be here `<project folder>/android/app/build/outputs/apk/release/app-release.apk`

Install the bundle on your android device, and open the app

### iOS

Create a release build by opening the `ios/CodePushExpoDemoApp.xcworkspace` in Xcode. Make sure it is a release build (in Xcode go to Product > Scheme > Edit Scheme > Select Run from left bar menu > verify that Release is selected in Build Configuration.). Choose a Simulator as well in Xcode, and Run. Wait till the app loads in simulator.

## Step 4: Make a change to App.js

Make a visible update to the App, by modifying App.js

## Step 5: Generate update Bundle

Run the following command to generate updated bundle

### Android

```
npx expo export:embed \               
  --entry-file index.js \
  --platform android \
  --dev false \
  --reset-cache \
  --bundle-output ./build/index.android.bundle \
  --assets-dest ./build \
  --minify false
```

### iOS

```
npx expo export:embed \               
  --entry-file index.js \
  --platform ios \
  --dev false \
  --reset-cache \
  --bundle-output ./build/main.jsbundle \
  --assets-dest ./build \
  --minify false
```

## Step 6: Upload the update bundle to codepush server

Upload the update bundle to your codepush server following the instructions from the codepush server that you use

## Step 7: Open the app on your device

Close/kill the app, and reopen the app. When the app is opened, it will show that there is an update you can install


