module.exports = class Accessory {
    constructor(platform, accessory) {
        this.states = {
            On: false,
            Brightness: 100,
        };

        this.platform = platform;
        this.accessory = accessory;

        this.accessory.getService(this.platform.Service.AccessoryInformation)
            .setCharacteristic(this.platform.Characteristic.Manufacturer, "Default-Manufacturer")
            .setCharacteristic(this.platform.Characteristic.Model, "Default-Model")
            .setCharacteristic(this.platform.Characteristic.SerialNumber, "Default-Serial");

        this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.DisplayName);

        this.service.getCharacteristic(this.platform.Characteristic.On)
            .on("set", this.setOn.bind(this))
            .on("get", this.getOn.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.Brightness)
            .on("set", this.setBrightness.bind(this));

        const motionSensorOneService = this.accessory.getService("Motion Sensor One Name") || this.accessory.addService(this.platform.Service.MotionSensor, "Motion Sensor One Name", "YourUniqueIdentifier-1");
        const motionSensorTwoService = this.accessory.getService("Motion Sensor Two Name") || this.accessory.addService(this.platform.Service.MotionSensor, "Motion Sensor Two Name", "YourUniqueIdentifier-2");

        let motionDetected = false;

        setInterval(() => {
            motionDetected = !motionDetected;

            motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
            motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected);

            this.platform.log.debug("Triggering motionSensorOneService:", motionDetected);
            this.platform.log.debug("Triggering motionSensorTwoService:", !motionDetected);
        }, 10000);
    }

    setOn(value, callback) {
        this.states.On = value;
        this.platform.log.debug("Set Characteristic On ->", value);

        callback(null);
    }

    getOn(callback) {
        const isOn = this.states.On;

        this.platform.log.debug("Get Characteristic On ->", isOn);

        callback(null, isOn);
    }

    setBrightness(value, callback) {
        this.states.Brightness = value;
        this.platform.log.debug("Set Characteristic Brightness -> ", value);

        callback(null);
    }
};
