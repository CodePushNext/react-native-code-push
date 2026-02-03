# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React Native CodePush is a native module that enables over-the-air updates for React Native apps. It consists of native implementations for iOS (Objective-C), Android (Java), and Windows (C++), unified through a JavaScript bridge layer.

## Development Commands

### Testing
- `npm test` - Run all tests with TypeScript compilation
- `npm run test:android` - Run Android-specific tests
- `npm run test:ios` - Run iOS-specific tests  
- `npm run test:setup-android` - Set up Android emulator for testing
- `npm run test:setup-ios` - Set up iOS simulator for testing

### Build
- `npm run build` - Build TypeScript tests to bin/ directory
- `npm run tsc` - TypeScript compilation

### Platform Testing
- Tests run on actual emulators/simulators with real React Native apps
- Test apps are created dynamically in `test/` directory
- Both old and new React Native architecture testing supported

## Architecture

### Core Components
- **JavaScript Bridge** (`CodePush.js`): Main API layer exposing update methods
- **Native Modules**: Platform-specific implementations handling file operations, bundle management
- **Update Manager**: Handles download, installation, and rollback logic
- **Acquisition SDK**: Manages server communication and update metadata

### Platform Structure
- **iOS**: `ios/` - Objective-C implementation with CocoaPods integration
- **Android**: `android/` - Java implementation with Gradle plugin
- **Windows**: `windows/` - C++ implementation for Windows React Native
- **JavaScript**: Root level - TypeScript definitions and bridge code

### Key Patterns
- **Higher-Order Component**: `codePush()` wrapper for automatic update management
- **Promise-based Native Bridge**: All native operations return promises
- **Platform Abstraction**: Unified JavaScript API with platform-specific implementations
- **Error Handling**: Automatic rollback on failed updates with telemetry

### Testing Framework
- **Custom Test Runner**: TypeScript-based test framework in `test/`
- **Emulator Management**: Automated setup and teardown of test environments
- **Real App Testing**: Creates actual React Native apps for integration testing
- **Scenario Testing**: Update, rollback, and error scenarios

### Build Integration
- **Android Gradle Plugin**: Automatically generates bundle hashes and processes assets
- **iOS CocoaPods**: Manages native dependencies and build configuration
- **Bundle Processing**: Automated zip creation and hash calculation for OTA updates

## Development Workflow

1. **Making Changes**: Edit native code or JavaScript bridge
2. **Testing**: Run platform-specific tests with real emulators
3. **Integration**: Test with actual React Native apps via test framework
4. **Validation**: Ensure compatibility with both RN architectures

## Key Files
- `CodePush.js` - Main JavaScript API
- `test/TestRunner.ts` - Test framework entry point
- `android/build.gradle` - Android build configuration
- `ios/CodePush.podspec` - iOS CocoaPods specification
- `plugin.xml` - Cordova plugin configuration

## Special Considerations
- Native module requires platform-specific knowledge (iOS/Android/Windows)
- Testing requires emulator setup and can be time-intensive
- Updates must be backward compatible with existing app installations
- Bundle hash calculation is critical for update integrity