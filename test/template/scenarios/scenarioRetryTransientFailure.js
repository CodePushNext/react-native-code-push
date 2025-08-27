var CodePushWrapper = require("../codePushWrapper.js");

module.exports = {
    startTest: function (testApp) {
        CodePushWrapper.checkForUpdate(testApp,
            function(remotePackage) {
                if (remotePackage) {
                    testApp.testMessage("Starting retry behavior test");
                    
                    // The download URL will be set to trigger retries (unreachable host, HTTP 500, etc.)
                    // RetryHelper will log retry attempts before eventually failing
                    CodePushWrapper.download(testApp, 
                        function() {
                            testApp.testMessage("Unexpected download success");
                        },
                        function(error) {
                            // Expected outcome after RetryHelper exhausts all retry attempts
                            testApp.testMessage("Download failed after retry attempts: " + error.message);
                        },
                        remotePackage
                    );
                } else {
                    testApp.testMessage("No update available for retry test");
                }
            },
            function(error) {
                testApp.testMessage("Check for update failed: " + error.message);
            }
        );
    },

    getScenarioName: function () {
        return "Retry Behavior Test";
    }
};
