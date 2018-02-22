'use strict';

var Color = require('color');

var Characteristic, Service;

module.exports = function(homebridge){
    console.log("homebridge API version: " + homebridge.version);

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-magichome', 'MagicHome', MagicHomeAccessory, false);
};

function MagicHomeAccessory(log, config, api) {

    this.log = log;
    this.config = config;
    this.name = config.name || 'LED Controller';
    this.setup = config.setup || 'RGBW';
    this.port = config.port || 5577;
    this.ip = config.ip;
    this.color = Color.hsv([0, 0, 100]);
    this.purewhite = config.purewhite || false;
    this.singleChannel = config.singleChannel || false;

    this.getColorFromDevice();

}

MagicHomeAccessory.prototype.identify = function(callback) {
    this.log('Identify requested!');
    callback();
};

MagicHomeAccessory.prototype.getServices = function() {
    var informationService = new Service.AccessoryInformation();

    informationService
        .setCharacteristic(Characteristic.Manufacturer, 'ACME Ltd.')
        .setCharacteristic(Characteristic.Model, 'LED-controller')
        .setCharacteristic(Characteristic.SerialNumber, '123456789');

    var lightbulbService = new Service.Lightbulb(this.name);

    lightbulbService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this));

    lightbulbService
        .addCharacteristic(new Characteristic.Brightness())
        .on('get', this.getBrightness.bind(this))
        .on('set', this.setBrightness.bind(this));

    if (this.singleChannel == false) {
        lightbulbService
            .addCharacteristic(new Characteristic.Hue())
            .on('get', this.getHue.bind(this))
            .on('set', this.setHue.bind(this));

        lightbulbService
            .addCharacteristic(new Characteristic.Saturation())
            .on('get', this.getSaturation.bind(this))
            .on('set', this.setSaturation.bind(this));
    };

        return [informationService, lightbulbService];

};

// UTIL

MagicHomeAccessory.prototype.sendCommand = function(command, callback) {
    var exec = require('child_process').exec;
    var cmd =  __dirname + '/flux_led.py ' + this.ip + ' ' + command;
    exec(cmd, callback);
};

MagicHomeAccessory.prototype.getState = function (callback) {
    this.sendCommand('-i', function(error, stdout) {
        var settings = {
            on: false,
            color: Color.hsv([0, 0, 100])
        };

        var colors = stdout.match(/\(\d{1,3}\, \d{1,3}, \d{1,3}\)/g);
        var isOn = stdout.match(/\] ON /g);
        
        if(isOn && isOn.length > 0) settings.on = true;
        if(colors && colors.length > 0) {
            settings.color = Color('rgb(' + stdout.match(/\d{1,3}/g) + ')');
        }

        callback(settings);

    });
};

MagicHomeAccessory.prototype.getColorFromDevice = function() {
    this.getState(function(settings) {
        this.color = settings.color;
        this.log("DEVICE COLOR - (H,S,V): %s  (R,G,B): %s", 
            (Math.round(settings.color.hue())+','+Math.round(settings.color.saturationv())+','+Math.round(settings.color.value())), 
            settings.color.rgb().round().array());
    }.bind(this));
};

MagicHomeAccessory.prototype.setToCurrentColor = function() {
    var color = this.color;

    if(color.saturationv() == 0 && color.hue() == 0 && this.purewhite) {
        this.setToWarmWhite();
        return
    }

    var base = '-x ' + this.setup + ' -c ' + color.rgb().round().array();
    this.sendCommand(base);
};

MagicHomeAccessory.prototype.setToWarmWhite = function() {
    var brightness = Math.round(this.color.value());
    this.sendCommand('-w ' + brightness);
};

// POWERSTATE

MagicHomeAccessory.prototype.getPowerState = function(callback) {
    this.getState(function(settings) {
        callback(null, settings.on);
    });
};

MagicHomeAccessory.prototype.setPowerState = function(value, callback) {
    this.log("DEVICE POWER: " + (value ? "ON" : "OFF"));
    this.sendCommand(value ? '--on' : '--off', function() {
        callback();
    });
};

// HUE

MagicHomeAccessory.prototype.getHue = function(callback) {
   callback(null, this.color.hue());
};

MagicHomeAccessory.prototype.setHue = function(value, callback) {
    this.color = Color(this.color).hue(value);
    this.setToCurrentColor();
    this.log("HUE: %s", value);
    callback();
};

// SATURATION

MagicHomeAccessory.prototype.getSaturation = function(callback) {
   callback(null, this.color.saturationv());
};

MagicHomeAccessory.prototype.setSaturation = function(value, callback) {
    this.color = Color(this.color).saturationv(value);
    this.setToCurrentColor();
    this.log("SATURATION: %s", value);
    callback();
};

// BRIGHTNESS

MagicHomeAccessory.prototype.getBrightness = function(callback) {
    if (this.singleChannel == true) {
        var curRgbValue = this.color.rgb().array()[0];
        if (curRgbValue <= 50) {
            callback(null, curRgbValue);
        } else {
            var rgbToValue = Math.round((8.8348 + Math.sqrt(78.05369104 - (4 * 0.086 * (278.07 - curRgbValue ) ) ) ) / (2 * 0.086));
            callback(null, rgbToValue);
        }
    } else {
        callback(null, this.color.value());
    }
};

MagicHomeAccessory.prototype.setBrightness = function(value, callback) {
    if (this.singleChannel == true) {
        if (value <= 50) {
            this.color = Color.rgb([value, value, value]);
        } else {
            var valueToRgb = Math.round( ((0.086 * Math.pow(value, 2)) - (8.8348 * value) + 278.07), 0);
            this.color = Color.rgb([valueToRgb, valueToRgb, valueToRgb]);
        }
    } else {
        this.color = Color(this.color).value(value);
    }
    this.setToCurrentColor();
    this.log("BRIGHTNESS: %s", value);
    callback();
};
