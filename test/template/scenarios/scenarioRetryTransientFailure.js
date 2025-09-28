var CodePushWrapper = require("../codePushWrapper.js");

module.exports = {
    startTest: function (testApp) {
        CodePushWrapper.checkForUpdate(testApp,
            function(remotePackage) {
                if (remotePackage) {
                    // The download URL will be set to trigger retries (unreachable host, HTTP 500, etc.)
                    // RetryHelper will log retry attempts before eventually failing
                    CodePushWrapper.download(testApp, 
                        function() {
                        },
                        function(error) {
                        },
                        remotePackage
                    );
                } else {
                    testApp.sendTestMessage("No update available for retry test");
                }
            },
            function(error) {
                testApp.sendTestMessage("Check for update failed: " + error.message);
            }
        );
    },

    getScenarioName: function () {
        return "Retry Behavior Test";
    }
};
