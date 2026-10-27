const { join } = require('path');
const { tmpdir } = require('os');

const chromeUserDataDir = join(tmpdir(), `karma-chrome-${process.pid}-${Date.now()}`);

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine'],
    plugins: [require('karma-jasmine'), require('karma-chrome-launcher')],
    reporters: ['progress'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    customLaunchers: {
      // CI runners (Ubuntu 24.04) block Chrome's sandbox.
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          `--user-data-dir=${chromeUserDataDir}`,
        ],
      },
    },
    browsers: ['ChromeHeadlessCI'],
    singleRun: true,
    restartOnFileChange: false,
  });
};
