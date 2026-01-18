var CodePushWrapper = require("../codePushWrapper.js");

module.exports = {
    startTest: function (testApp) {
        CodePushWrapper.checkForUpdate(testApp, function(remotePackage) {
            var progressCount = 0;

            remotePackage.download((progress) => {
                var isValid = typeof progress.totalBytes === 'number' &&
                              typeof progress.receivedBytes === 'number' &&
                              progress.totalBytes > 0 &&
                              progress.receivedBytes >= 0 &&
                              progress.receivedBytes <= progress.totalBytes;

                if (isValid) {
                    progressCount++;
                }
            })
            .then((localPackage) => {
                // send final count
                testApp.setStateAndSendMessage(
                    "Progress events received: " + progressCount,
                    "DOWNLOAD_PROGRESS_COUNT",
                    [progressCount]
                );
                return testApp.downloadSuccess(localPackage);
            }, (error) => {
                return testApp.downloadError(error);
            });
        });
    },
    getScenarioName: function () {
        return "Download Progress";
    }
};
