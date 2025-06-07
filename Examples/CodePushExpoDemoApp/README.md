This is a [**React Native Expo**](https://docs.expo.dev/) project, created using the command `npx create-expo-app@latest --template blank`. The App.js file was then modified to add codepush functionality

# Testing Codepush functionality

## Step 1: Set Codepush Server and Codepush Deployment key in app.json

In app.json set `CodePushDeploymentKey` and `CodePushServerURL` for ios and android. 

## Step 2: Run expo prebuild

run `npx expo prebuild --clean`

## Step 3: Create release bundle 

### Android

run `cd android && ./gradlew assembleRelease` 

The apk bundle will be here `<project folder>/android/app/build/outputs/apk/release/app-release.apk`

Install the bundle on your android device

## Step 4: Make a change to App.js

Make a visible update to the App, by modifying App.js

## Step 5: Generate update Bundle

Run the following command to generate updated bundle

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

## Step 6: Upload the update bundle to codepush server

Upload the bundle to your codepush server

## Step 7: Open the app on your device

When the app is opened, it will show that there is an update you can install


