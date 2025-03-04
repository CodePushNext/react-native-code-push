var CodePushWrapper = require("../codePushWrapper.js");
import CodePush from "@appsonair/react-native-code-push";

module.exports = {
  startTest: function (testApp) {
    CodePush.disallowRestart();
    CodePushWrapper.checkAndInstall(
      testApp,
      () => {
        CodePush.allowRestart();
      },
      undefined,
      CodePush.InstallMode.IMMEDIATE,
      undefined,
      true
    );
  },

  getScenarioName: function () {
    return "disallowRestart";
  },
};
