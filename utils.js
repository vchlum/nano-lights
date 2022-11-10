'use strict';

/**
 * utils hue-lights
 * JavaScript Gnome extension for Philips Hue lights and bridges.
 *
 * @author Václav Chlumský
 * @copyright Copyright 2022, Václav Chlumský.
 */

/**
 * @license
 * The MIT License (MIT)
 *
 * Copyright (c) 2022 Václav Chlumský
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = imports.misc.config;
const NM = imports.gi.NM;

var NANOLIGHTS_SETTINGS_SCHEMA = "org.gnome.shell.extensions.nano-lights";
var NANOLIGHTS_SETTINGS_FORCE_ENGLISH = "force-english";
var NANOLIGHTS_SETTINGS_DEVICES = "devices";
var NANOLIGHTS_SETTINGS_DEVICES_TYPE = "a{sa{ss}}";
var NANOLIGHTS_SETTINGS_INDICATOR = "indicator-position";
var NANOLIGHTS_SETTINGS_CONNECTION_TIMEOUT = "connection-timeout";
var NANOLIGHTS_SETTINGS_DEBUG = "debug";
var NANOLIGHTS_SETTINGS_ICONPACK = "icon-pack";
var NANOLIGHTS_SETTINGS_MENU_SELECTED = "menu-selected";
var NANOLIGHTS_SETTINGS_MENU_SELECTED_TYPE = "a{sa{si}}";

const [major] = Config.PACKAGE_VERSION.split(".");
var shellVersion = Number.parseInt(major);

const Gettext = imports.gettext.domain('nano-lights');
var forceEnglish = ExtensionUtils.getSettings(
    NANOLIGHTS_SETTINGS_SCHEMA
).get_boolean(NANOLIGHTS_SETTINGS_FORCE_ENGLISH);
const _ = forceEnglish ? (a) => { return a; } : Gettext.gettext;

var debug = false;

/**
 * Logs debug message
 *
 * @method logDebug
 * @param {String} meassage to print
 */
function logDebug(msg) {
    if (debug) {
        log(`Nano Lights [debug]: ${msg}`)
    }
}

/**
 * Logs error message
 *
 * @method logError
 * @param {String} meassage to print
 */
 function logError(msg) {
    log(`Nano Lights [error]: ${msg}`)
}

/**
 * Converts Philips Hue colour temperature of white to
 * kelvin temperature (2000K - 6500K).
 * Lights are capable of 153 (6500K) to 500 (2000K).
 * https://developers.meethue.com/develop/hue-api/lights-api/
 * https://developers.meethue.com/forum/t/about-the-ct-value/6239/4
 * 
 * @method ctToKelvin
 * @param {Number} ct
 * @return {Number} temperature in kelvin
 */
function ctToKelvin(ct) {

    if (ct < 153) {ct = 153;}
    if (ct > 500) {ct = 500;}

    return Math.round(6500 - ((ct - 153) / (347 / 4500)));
}

/**
 * Converts kelvin temperature (2000K - 6500K) to
 * Philips Hue colour temperature of white.
 * Lights are capable of 153 (6500K) to 500 (2000K).
 * https://developers.meethue.com/develop/hue-api/lights-api/
 * https://developers.meethue.com/forum/t/about-the-ct-value/6239/4
 * 
 * @method kelvinToCt
 * @param {Number} k temperature in kelvin
 * @return {Number} ct
 */
function kelvinToCt(k) {

    if (k < 2000) {k = 2000;}
    if (k > 6500) {k = 6500;}

    return Math.round(500 - ((k - 2000) / (4500 / 347)));
}

/**
 * Converts kelvin temperature to RGB
 * https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html
 * 
 * @method kelvinToRGB
 * @param {Number} kelvin in temperature
 * @return {Object} array with [R, G, B]
 */
function kelvinToRGB(kelvin) {
    let tmpCalc = 0;
    let tmpKelvin = kelvin;
    let red = 0;
    let green = 0;
    let blue = 0;

    if (tmpKelvin < 1000) {
        tmpKelvin = 1000;
    }

    if (tmpKelvin > 40000) {
        tmpKelvin = 40000;
    }

    tmpKelvin = tmpKelvin / 100;

    if (tmpKelvin <= 66) {
        red = 255;
    } else {
        tmpCalc = tmpKelvin - 60;
        tmpCalc = 329.698727446 * Math.pow(tmpCalc, -0.1332047592);

        red = tmpCalc;
        if (red < 0) {red = 0;}
        if (red > 255) {red = 255;}
    }

    if (tmpKelvin <= 66) {
        tmpCalc = tmpKelvin;
        tmpCalc = 99.4708025861 * Math.log(tmpCalc) - 161.1195681661;

        green = tmpCalc;
        if (green < 0) {green = 0;}
        if (green > 255) {green = 255;}
    } else {
        tmpCalc = tmpKelvin - 60;
        tmpCalc = 288.1221695283 * Math.pow(tmpCalc, -0.0755148492);

        green = tmpCalc;
        if (green < 0) {green = 0;}
        if (green > 255) {green = 255;}
    }

    if (tmpKelvin >= 66) {
        blue = 255;
    } else if (tmpKelvin <=19) {
        blue = 0;
    } else {
        tmpCalc = tmpKelvin - 10;
        tmpCalc = 138.5177312231 * Math.log(tmpCalc) - 305.0447927307;

        blue = tmpCalc;
        if (blue < 0) {blue = 0;}
        if (blue > 255) {blue = 255;}
    }

    return [Math.round(red), Math.round(green), Math.round(blue)];
}

/**
 * Converts RGB to the closest kelvin in table
 * 
 * @method RGBToKelvin
 * @param {Number} red
 * @param {Number} green
 * @param {Number} blue
 * @return {Object} kelvin in temperature
 */
function RGBToKelvin(r, g, b) {
    let selectR = -1;
    let selectG = -1;
    let selectB = -1;
    let difference;

    /**
     * https://andi-siess.de/rgb-to-color-temperature/
     * RGB values are 2200-9200, relative temperature
     * is 2200-6500, which is suitable for the devices.
     */

    const whiteTemeratures = {
        2200: [255,147,44],
        2339: [255,154,57],
        2478: [255,161,70],
        2617: [255,167,84],
        2756: [255,174,97],
        2895: [255,181,110],
        3034: [255,188,123],
        3173: [255,194,136],
        3312: [255,201,150],
        3451: [255,208,163],
        3590: [255,215,176],
        3729: [255,221,189],
        3868: [255,228,202],
        4007: [255,235,215],
        4146: [255,242,227],
        4285: [255,248,242],
        4419: [255,255,255],
        4554: [252,253,255],
        4693: [249,251,255],
        4832: [246,249,255],
        4971: [243,247,255],
        5110: [240,245,255],
        5249: [237,243,255],
        5388: [234,241,255],
        5527: [232,239,255],
        5666: [229,236,255],
        5805: [226,234,255],
        5944: [223,232,255],
        6083: [220,230,255],
        6222: [217,228,255],
        6361: [214,226,255],
        6500: [211,224,255]
    }

    difference = 255;
    for (let i in whiteTemeratures) {
        let tmp = r - whiteTemeratures[i][0];
        if (tmp < 0) { tmp = tmp * -1; }

        if (tmp < difference) {
            difference = tmp;
            selectR = whiteTemeratures[i][0];
        }
    }

    difference = 255;
    for (let i in whiteTemeratures) {
        if (whiteTemeratures[i][0] !== selectR) {
            continue;
        }

        let tmp = g - whiteTemeratures[i][1];
        if (tmp < 0) { tmp = tmp * -1; }

        if (tmp < difference) {
            difference = tmp;
            selectG = whiteTemeratures[i][1];
        }
    }

    difference = 255;
    for (let i in whiteTemeratures) {
        if (whiteTemeratures[i][0] !== selectR) {
            continue;
        }

        if (whiteTemeratures[i][1] !== selectG) {
            continue;
        }

        let tmp = b - whiteTemeratures[i][2];
        if (tmp < 0) { tmp = tmp * -1; }

        if (tmp < difference) {
            difference = tmp;
            selectB = whiteTemeratures[i][2];
        }
    }

    for (let i in whiteTemeratures) {
        if (whiteTemeratures[i][0] !== selectR) {
            continue;
        }

        if (whiteTemeratures[i][1] !== selectG) {
            continue;
        }

        if (whiteTemeratures[i][2] !== selectB) {
            continue;
        }

        return i;
    }

    return 0;
}

/**
 * Converts RGB to xy values for Philips Hue Lights.
 * https://stackoverflow.com/questions/22564187/rgb-to-philips-hue-hsb 
 * https://github.com/PhilipsHue/PhilipsHueSDK-iOS-OSX/commit/f41091cf671e13fe8c32fcced12604cd31cceaf3 
 * https://developers.meethue.com/develop/application-design-guidance/color-conversion-formulas-rgb-to-xy-and-back/#Color-rgb-to-xy
 * 
 * @method colorToHueXY
 * @param {Number} red
 * @param {Number} green
 * @param {Number} blue
 * @return {Object} array with [x, y]
 */
function colorToHueXY(cred, cgreen, cblue) {
    // For the hue bulb the corners of the triangle are:
    // -Red: 0.675, 0.322
    // -Green: 0.4091, 0.518
    // -Blue: 0.167, 0.04
    let normalizedToOne = [];
    let red;
    let green
    let blue;

    normalizedToOne[0] = (cred / 255);
    normalizedToOne[1] = (cgreen / 255);
    normalizedToOne[2] = (cblue / 255);


    // Make red more vivid
    if (normalizedToOne[0] > 0.04045) {
        red = Math.pow(
                (normalizedToOne[0] + 0.055) / (1.0 + 0.055), 2.4);
    } else {
        red = (normalizedToOne[0] / 12.92);
    }

    // Make green more vivid
    if (normalizedToOne[1] > 0.04045) {
        green = Math.pow((normalizedToOne[1] + 0.055)
                / (1.0 + 0.055), 2.4);
    } else {
        green = (normalizedToOne[1] / 12.92);
    }

    // Make blue more vivid
    if (normalizedToOne[2] > 0.04045) {
        blue = Math.pow((normalizedToOne[2] + 0.055)
                / (1.0 + 0.055), 2.4);
    } else {
        blue = (normalizedToOne[2] / 12.92);
    }

    let X = (red * 0.649926 + green * 0.103455 + blue * 0.197109);
    let Y = (red * 0.234327 + green * 0.743075 + blue * 0.022598);
    let Z = (red * 0.0000000 + green * 0.053077 + blue * 1.035763);

    let x = X / (X + Y + Z);
    let y = Y / (X + Y + Z);

    let xy = [];
    xy[0] = x;
    xy[1] = y;

    return xy;
}

/**
 * Convert xy and brightness to RGB
 * https://stackoverflow.com/questions/22894498/philips-hue-convert-xy-from-api-to-hex-or-rgb
 * https://stackoverflow.com/questions/16052933/convert-philips-hue-xy-values-to-hex
 *
 * @param {Number} x
 * @param {Number} y
 * @param {Number} bri
 * @return {Object} array with RGB
 */
function XYBriToColor(x, y, bri) {
    let z = 1.0 - x - y;
    let Y = bri / 255.0;
    let X = (Y / y) * x;
    let Z = (Y / y) * z;

    let r = X * 1.612 - Y * 0.203 - Z * 0.302;
    let g = -X * 0.509 + Y * 1.412 + Z * 0.066;
    let b = X * 0.026 - Y * 0.072 + Z * 0.962;

    r = r <= 0.0031308 ? 12.92 * r : (1.0 + 0.055) * Math.pow(r, (1.0 / 2.4)) - 0.055;
    g = g <= 0.0031308 ? 12.92 * g : (1.0 + 0.055) * Math.pow(g, (1.0 / 2.4)) - 0.055;
    b = b <= 0.0031308 ? 12.92 * b : (1.0 + 0.055) * Math.pow(b, (1.0 / 2.4)) - 0.055;

    let maxValue = Math.max(r,g,b);

    r /= maxValue;
    g /= maxValue;
    b /= maxValue;

     /* do not know why thay have if (r < 0) { r = 255 }; this works better */
    r = r * 255; if (r < 0) { r *= -1 };
    g = g * 255; if (g < 0) { g *= -1 };
    b = b * 255; if (b < 0) { b *= -1 };

    if (r > 255) { r = 0 };
    if (g > 255) { g = 0 };
    if (b > 255) { b = 0 };

    r = Math.round(r);
    g = Math.round(g);
    b = Math.round(b);

    return [r, g, b];
}

/**
 * Convert string to array of bytes.
 *
 * @param {String} s string to convert
 * @return {Object} array of bytes
 */
function string2Hex(s) {
    let ret = [];

    for (let i = 0; i < s.length; i++) {
        ret.push(s.charCodeAt(i));
    }

    return ret;
}

/**
 * Hash function string to number.
 * https://linuxhint.com/javascript-hash-function/
 *
 * @param {String} string to hash
 * @return {Integer} number
 */
function hashMe(string) {
    let hash = 0;

    if (string.length == 0) {
        return hash;
    }

    for (let x = 0; x <string.length; x++) {
        let ch = string.charCodeAt(x);
        hash = ((hash <<5) - hash) + ch;
        hash = hash & hash;
    }

    return hash;
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 * 
 * https://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion
 *
 * @param   {number}  h       The hue
 * @param   {number}  s       The saturation
 * @param   {number}  l       The lightness
 * @return  {Array}           The RGB representation
 */
 function hslToRgb(h, s, l){
    var r, g, b;

    if(s == 0){
        r = g = b = l; // achromatic
    }else{
        var hue2rgb = function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}


/**
 * Converts an RGB color value to HSL. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and l in the set [0, 1].
 * 
 * https://stackoverflow.com/questions/2353211/hsl-to-rgb-color-conversion
 *
 * @param   {number}  r       The red color value
 * @param   {number}  g       The green color value
 * @param   {number}  b       The blue color value
 * @return  {Array}           The HSL representation
 */
 function rgbToHsl(r, g, b){
    r /= 255, g /= 255, b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;

    if(max == min){
        h = s = 0; // achromatic
    }else{
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch(max){
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return [h, s, l];
}