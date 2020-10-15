const { PLATFORM_NAME, PLUGIN_NAME } = require("./settings");
const Accessory = require("./accessory");

module.exports = class Platform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;

        this.log.debug("Finished initializing platform:", this.config.name);

        this.api.on("didFinishLaunching", () => {
            log.debug("Executed didFinishLaunching callback");

            this.discoverDevices();
        });
    }

    configureAccessory(accessory) {
        this.log.info("Loading accessory from cache:", accessory.displayName);

        this.accessories.push(accessory);
    }

    discoverDevices() {
        const devices = [
            {
                uuid: "ABCD",
                displayName: "Bedroom",
            },
            {
                uuid: "EFGH",
                displayName: "Kitchen",
            },
        ];

        for (let i = 0; i < devices.length; i += 1) {
            const device = devices[i];

            const uuid = this.api.hap.uuid.generate(device.uuid);
            const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

            if (existingAccessory) {
                if (device) {
                    this.log.info("Restoring existing accessory from cache:", existingAccessory.displayName);

                    new Accessory(this, existingAccessory);

                    this.api.updatePlatformAccessories([existingAccessory]);
                } else if (!device) {
                    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
                    this.log.info("Removing existing accessory from cache:", existingAccessory.displayName);
                }
            } else {
                this.log.info("Adding new accessory:", device.displayName);

                const accessory = new this.api.platformAccessory(device.displayName, uuid);

                accessory.context.device = device;

                new Accessory(this, accessory);

                this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
        }
    }
};
