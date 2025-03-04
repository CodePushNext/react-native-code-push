var CodePushWrapper = require("../codePushWrapper.js");
import CodePush from "@appsonair/react-native-code-push";

module.exports = {
  startTest: function (testApp) {
    CodePushWrapper.checkAndInstall(testApp, () => {
      CodePush.restartApp();
      CodePush.restartApp();
    });
  },

  getScenarioName: function () {
    return "Install and Restart 2x";
  },
};
