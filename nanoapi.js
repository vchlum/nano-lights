'use strict';

/**
 * nanoapi
 * JavaScript library for Nanoleaf.
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

 /**
 * Nano API class for one device.
 *
 * @class Nano
 * @constructor
 * @private
 * @param {String} ip address
 * @return {Object} instance
 */

const Soup = imports.gi.Soup;
const Json = imports.gi.Json;
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const GObject = imports.gi.GObject;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

var NanoRequestype = {
    NO_RESPONSE_NEED: 0,
    SELF_CHECK: 1,
    AUTHORIZATION: 2,
    CHANGE_OCCURRED: 3,
    INFO_DATA: 4,
    ALL_EFFECTS: 5
};

var NanoMessage = class NanoMessage extends Soup.Message {

    constructor(params) {

        super(params);

        this.requestNanoType = NanoRequestype.NO_RESPONSE_NEED;

        Object.assign(this, params);
    }
};

var Nano =  GObject.registerClass({
    GTypeName: "Nano",
    Properties: {
        "id": GObject.ParamSpec.string("id", "id", "id", GObject.ParamFlags.READWRITE, null),
        "ip": GObject.ParamSpec.string("ip", "ip", "ip", GObject.ParamFlags.READWRITE, null),
    },
    Signals: {
        "authorized": {},
        "self-check": {},
        "info-data": {},
        "change-occurred": {},
        "all-effects": {},
        "connection-problem": {},
    }
}, class Nano extends GObject.Object {
    _init(props={}) {
        this._baseUrl = "http://"
        this._defaultPort = "16021"

        super._init(props);

        this._authToken = "";
        this._connected = false;
        this._deviceData = undefined;

        this.name = "unknown name";

        this._deviceSession = Soup.Session.new();
        this._deviceSession.timeout = 5;
    }

    set id(value) {
        this._id = value;
    }

    get id() {
        return this._id;
    }

    set ip(value) {
        this._ip = value;
        this._baseUrl = `http://${this._ip}:${this._defaultPort}/api/v1`;
    }

    get ip() {
        return this._ip;
    }

    /**
     * Set connection timeout
     * 
     * @method setConnectionTimeout
     * @param {Number} sec timeout in seconds
     */
    setConnectionTimeout(sec) {

        this._deviceSession.timeout = sec;
    }

    update(data) {

        if (data["ip"] != undefined){
            this.ip = data["ip"];
        }

        if (data["hostname"] != undefined){
            this.name = data["hostname"];
        }

        if (data["name"] != undefined){
            this.name = data["name"];
        }

        if (data["auth_token"] != undefined){
            this._authToken = data["auth_token"];
        }

    }

    export() {
        let data = {};

        data[this._id] = {'ip': this._ip, 'port': this._defaultPort, 'name': this.name, 'auth_token': this._authToken};

        return data;
    }

    isConnected() {
        return this._connected;
    }

    isAuthenticated() {
        if (this._authToken !== "") {
            return true;
        }

        return false;
    }

    /**
     * Parse and emit result of device response.
     *
     * @method _responseJsonParse
     * @private
     * @param {String} method to be used like POST, PUT, GET, DELETE
     * @param {String} requested url
     * @param {Object} request nano type
     * @param {String} JSON response
     */
     _responseJsonParse(method, url, requestNanoType, data) {
        try {
            Utils.logDebug(`Device ${method} responded OK to url: ${url}`);

            try {
                this._connected = true;
                this._data = JSON.parse(data);

            } catch {
                Utils.logError(`Device ${method} responded, failed to parse JSON`);
                this._data = [];
            }

            switch (requestNanoType) {
                case NanoRequestype.AUTHORIZATION:
                    this._deviceData = this._data;
                    this._authToken = this._deviceData["auth_token"];
                    this.emit("authorized");
                    break;

                case NanoRequestype.SELF_CHECK:
                    this.id = this._data["serialNo"];
                    this._connected = true;
                    this.emit("self-check");
                    break;

                case NanoRequestype.CHANGE_OCCURRED:
                    this._deviceData = this._data;
                    this.emit("change-occurred");
                    break;

                case NanoRequestype.INFO_DATA:
                    this._deviceData = this._data;
                    this.emit("info-data");
                    break;

                case NanoRequestype.ALL_EFFECTS:
                    this._deviceData = this._data;
                    this.emit("all-effects");
                    break;

                case NanoRequestype.NO_RESPONSE_NEED:
                    /* no signal emitted, request does not need response */
                    break;

                default:
            }

            return

        } catch {
            this._connectionProblem(requestNanoType);
        }
    }

    _requestJson(method, url, requestNanoType, data) {
        Utils.logDebug(`Device ${method} request, url: ${url} data: ${JSON.stringify(data)}`);

        let msg = NanoMessage.new(method, url);

        msg.requestNanoType = requestNanoType;

        if (data !== null) {
            msg.set_request_body_from_bytes(
                "application/json",
                new GLib.Bytes(JSON.stringify(data))
            );
        }

        this._deviceSession.send_and_read_async(msg, Soup.MessagePriority.NORMAL, null, (sess, res) => {

            switch(msg.get_status()) {
                case Soup.Status.OK:
                    try {
                        const bytes = this._deviceSession.send_and_read_finish(res);
                        let response = ByteArray.toString(bytes.get_data());
                        this._responseJsonParse(method, url, requestNanoType, response);
                    } catch {
                        this._connectionProblem(requestNanoType);
                    }
                    break;

                case Soup.Status.NO_CONTENT:
                    this._connected = true;
                    if (NanoRequestype.CHANGE_OCCURRED) {
                        this.emit("change-occurred");
                        break;
                    }
                    break;

                default:
                    this._connectionProblem(requestNanoType);
                    break;

            }
        });
    }

    /**
     * POST requst to url of a device.
     * 
     * @method _devicePOST
     * @private
     * @param {Boolean} url to be requested
     * @param {Object} input data
     * @return {Object} JSON with response
     */
    _devicePOST(url, requestNanoType, data = null) {

        this._requestJson("POST", url, requestNanoType, data);
    }

    /**
     * PUT requst to url of a device.
     * 
     * @method _devicePUT
     * @private
     * @param {Boolean} url to be requested
     * @param {Object} input data
     * @return {Object} JSON with response
     */
    _devicePUT(url, requestNanoType, data) {

        this._requestJson("PUT", url, requestNanoType, data);
    }

    /**
     * GET requst to url of a device.
     * 
     * @method _deviceGET
     * @private
     * @param {Boolean} url to be requested
     * @return {Object} JSON with response
     */
    _deviceGET(url, requestNanoType) {

        this._requestJson("GET", url, requestNanoType, null);
    }

    /**
     * DEL requst to url of a device.
     * 
     * @method _deviceDEL
     * @private
     * @param {Boolean} url to be requested
     * @return {Object} JSON with response
     */
     _deviceDELETE(url, requestNanoType) {

        this._requestJson("DELETE", url, requestNanoType, null);
    }

    authorizate() {
        let url = `${this._baseUrl}/new`;

        this._devicePOST(url, NanoRequestype.AUTHORIZATION);
    }

    selfCheck() {
        let url = `${this._baseUrl}/${this._authToken}`;

        this._deviceGET(url, NanoRequestype.SELF_CHECK); 
    }

    getDeviceInfo() {
        let url = `${this._baseUrl}/${this._authToken}`;

        this._deviceGET(url, NanoRequestype.INFO_DATA);
    }

    getDeviceAllEffects() {
        let url = `${this._baseUrl}/${this._authToken}/effects`;
        let data = { "write" : {"command" : "requestAll" }};

        this._devicePUT(url, NanoRequestype.ALL_EFFECTS, data);
    }

    setDeviceState(value) {
        let url = `${this._baseUrl}/${this._authToken}/state`;
        let data = {"on": { "value": value }};

        this._devicePUT(url, NanoRequestype.CHANGE_OCCURRED, data)
    }

    setDeviceColor(hue, sat, bri) {
        let url = `${this._baseUrl}/${this._authToken}/state`;
        let data = {"hue": { "value": hue }, "sat": { "value": sat }, "brightness" : { "value": bri} };

        this._devicePUT(url, NanoRequestype.CHANGE_OCCURRED, data)
    }

    setDeviceTemperature(value) {
        let url = `${this._baseUrl}/${this._authToken}/state`;
        let data = {"ct": { "value": value }};

        this._devicePUT(url, NanoRequestype.CHANGE_OCCURRED, data)
    }

    setDeviceBrightness(value, duration) {
        let url = `${this._baseUrl}/${this._authToken}/state`;
        let data = {"brightness" : { "value": value, "duration": duration }};

        this._devicePUT(url, NanoRequestype.CHANGE_OCCURRED, data)
    }

    setDeviceEffect(effect) {
        let url = `${this._baseUrl}/${this._authToken}/effects`;
        let data = { "select": effect };

        this._devicePUT(url, NanoRequestype.CHANGE_OCCURRED, data)
    }

    deleteDeviceToken() {
        let url = `${this._baseUrl}/${this._authToken}`;

        this._deviceDELETE(url, NanoRequestype.NO_RESPONSE_NEED);

        this._authToken = "";
        this._connected = false;
    }

    /**
     * Returns data after the async request.
     * 
     * @method getAsyncData
     * @return {Object} dictionary with data
     */
    getAsyncData() {
        return this._deviceData;
    }

    /**
     * Mark problem with connection and emit the situation.
     *
     * @method _connectionProblem
     * @private
     * @param {Object} request nano type
     */
     _connectionProblem(requestNanoType) {
        this._connected = false;
        if (requestNanoType !== NanoRequestype.NO_RESPONSE_NEED) {
            this.emit("connection-problem");
        }
    }
})