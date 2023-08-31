'use strict';

/**
 * utils nano-lights
 * JavaScript Gnome extension for Nanoleaf.
 *
 * @author Václav Chlumský
 * @copyright Copyright 2023, Václav Chlumský.
 */

/**
 * @license
 * The MIT License (MIT)
 *
 * Copyright (c) 2023 Václav Chlumský
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

export var NANOLIGHTS_SETTINGS_SCHEMA = "org.gnome.shell.extensions.nano-lights";
export var NANOLIGHTS_SETTINGS_FORCE_ENGLISH = "force-english";
export var NANOLIGHTS_SETTINGS_DEVICES = "devices";
export var NANOLIGHTS_SETTINGS_DEVICES_TYPE = "a{sa{ss}}";
export var NANOLIGHTS_SETTINGS_INDICATOR = "indicator-position";
export var NANOLIGHTS_SETTINGS_CONNECTION_TIMEOUT = "connection-timeout";
export var NANOLIGHTS_SETTINGS_DEBUG = "debug";
export var NANOLIGHTS_SETTINGS_ICONPACK = "icon-pack";
export var NANOLIGHTS_SETTINGS_MENU_SELECTED = "menu-selected";
export var NANOLIGHTS_SETTINGS_MENU_SELECTED_TYPE = "a{sa{ss}}";

var _debug = false;

export function checkGettextEnglish(gettext, settings) {
    let forceEnglish = settings.get_boolean(NANOLIGHTS_SETTINGS_FORCE_ENGLISH);

    return forceEnglish ? (a) => { return a; } : gettext;
}

export function setDebug(debug) {
    _debug = debug;
}

export function getDebug() {
    return _debug;
}

/**
 * Logs debug message
 *
 * @method logDebug
 * @param {String} meassage to print
 */
export function logDebug(msg) {
    if (_debug) {
        log(`Nano Lights [debug]: ${msg}`)
    }
}

export function removeFromArray(arr, remove) {
    return arr.filter(
        (value) => { return value != remove; }
    );
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
 * Converts kelvin temperature to RGB
 * https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html
 * 
 * @method kelvinToRGB
 * @param {Number} kelvin in temperature
 * @return {Object} array with [R, G, B]
 */
export function kelvinToRGB(kelvin) {
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
export function RGBToKelvin(r, g, b) {
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
 * Convert string to array of bytes.
 *
 * @param {String} s string to convert
 * @return {Object} array of bytes
 */
export function string2Hex(s) {
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
export function hashMe(string) {
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
 * https://stackoverflow.com/questions/8022885/rgb-to-hsv-color-in-javascript
 * 0 <= r, g, b <= 255
 * 0 <= h <= 360
 * 0 <= s, l <= 100
 */
export function rgbToHsv (r, g, b) {
    let rabs, gabs, babs, rr, gg, bb, h, s, v, diff, diffc, percentRoundFn;
    rabs = r / 255;
    gabs = g / 255;
    babs = b / 255;
    v = Math.max(rabs, gabs, babs),
    diff = v - Math.min(rabs, gabs, babs);
    diffc = c => (v - c) / 6 / diff + 1 / 2;
    percentRoundFn = num => Math.round(num * 100) / 100;
    if (diff == 0) {
        h = s = 0;
    } else {
        s = diff / v;
        rr = diffc(rabs);
        gg = diffc(gabs);
        bb = diffc(babs);

        if (rabs === v) {
            h = bb - gg;
        } else if (gabs === v) {
            h = (1 / 3) + rr - bb;
        } else if (babs === v) {
            h = (2 / 3) + gg - rr;
        }
        if (h < 0) {
            h += 1;
        }else if (h > 1) {
            h -= 1;
        }
    }
    return [
        Math.round(h * 360),
        Math.round(percentRoundFn(s * 100)),
        Math.round(percentRoundFn(v * 100))
    ]
}

/**
 * https://stackoverflow.com/questions/17242144/javascript-convert-hsb-hsv-color-to-rgb-accurately/54024653#54024653
 * 0 <= h <= 360
 * 0 <= s, l <= 100
 * 0 <= r, g, b <= 255
 */
export function hsvToRgb(h, s, v) {
    h = h / 360.0
    s = s / 100.0
    v = v / 100.0
    let r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }

    return [
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255)
    ]
}