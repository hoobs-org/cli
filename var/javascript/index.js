const { PLATFORM_NAME } = require("./settings");
const Platform = require("./platform");

module.exports = (api) => {
    api.registerPlatform(PLATFORM_NAME, Platform);
};
