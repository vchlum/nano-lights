'use strict';

/**
 * prefs nano-lights
 * JavaScript Gnome extension for Nanoleaf devices.
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

const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const GObject = imports.gi.GObject;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Avahi = Me.imports.avahi;
const NanoApi = Me.imports.nanoapi;

const Gettext = imports.gettext.domain('nano-lights');
const _ = Gettext.gettext;

/**
 * AddDeviceIpDialog object. Provides dialog window
 * expecting device IP address as input.
 * 
 * @class AddDeviceIpDialog
 * @constructor
 * @param {Object} parent
 * @return {Object} gtk dialog
 */
const AddDeviceIpDialog = GObject.registerClass({
    GTypeName: 'AddNanoDeviceIpDialog',
    Template: Me.dir.get_child('ui/prefsadddeviceip.ui').get_uri(),
    Signals: {
        "ip-address-ok": {},
    },
    InternalChildren: [      
        'ipAddress',
    ],
}, class AddDeviceIpDialog extends Gtk.Dialog {

    _init(parentWindow) {
        super._init();

        this.set_transient_for(parentWindow);
    }

    /**
     * OK button clicket handler
     * 
     * @method _onOkClicked
     * @private
     * @param {Object} clicked button
     */
    _onOkClicked(button) {
        this.ip = this._ipAddress.text;
        this.emit("ip-address-ok");
        this.destroy();
    }
});




/**
 * DeviceTab object. One tab per device.
 * 
 * @class DeviceTab
 * @constructor
 * @param {Object} IP of the device
 * @param {Object} id of the device
 * @param {Object} device data
 * @return {Object} gtk ScrolledWindow
 */
 const DeviceTab = GObject.registerClass({
    GTypeName: 'NanoDeviceTab',
    Template: Me.dir.get_child('ui/prefsdevicetab.ui').get_uri(),
    InternalChildren: [
        'ipAddress',
        'statusLabel',
        'newName',
        'connectButton',
        'connectHintLabel',
    ],
    Signals: {
        "update": {},
        "remove-device": {},
    },
}, class DeviceTab extends Gtk.ScrolledWindow {

    _init(ip, id, data) {
        super._init();
        this._ip = ip;
        this._id = id;

        if (this._ip === undefined) {
            return;
        }

        this._ipAddress.set_text(this._ip);

        this.instance = new NanoApi.Nano({
            id: this._id,
            ip: this._ip
        });

        this.instance.connect(
            "authorized",
            () => {
                this.updateTab();
                this.instance.selfCheck();

                /* do not emit update here, wait for self check */
            }
        );

        this.instance.connect(
            "self-check",
            () => {
                this.updateTab();
                this.emit("update");
            }
        );

        this.instance.connect(
            "info-data",
            () => {
                this.updateTab();
            }
        );

        this.instance.connect(
            "connection-problem",
            () => {
                this.updateTab();
            }
        );

        if (data) {
            this.instance.update(data);
            this.instance.getDeviceInfo()
        }

        this.updateTab();
    }

    /**
     * Updates the overall device state.
     * 
     * @method updateDevice
     */
    updateTab() {
        if (this.instance.isAuthenticated()) {
            this._connectHintLabel.visible = false;
        } else {
            this._connectHintLabel.visible = true;
        }

        if (this.instance.isConnected()) {
            this._statusLabel.label = _("Connected");
            this._connectButton.label = _("Remove");
        } else {
            this._statusLabel.label = _("Unreachable");
            this._connectButton.label = _("Connect");
        }

        this._newName.text = this.instance.name;
    }

    _onRenameDeviceClicked(button) {
        if (this._newName.text.length === 0) {
            Utils.logDebug("New name is empty. Can not rename.");
            return;
        }

        if (!this.instance.isAuthenticated()) {
            Utils.logDebug("Device is not authenticated. Can not rename.");
            return;
        }

        this.instance.name = this._newName.text;
        this.emit("update");
    }

    /**
     * Button handler either connect unavailable device
     * or (if connected) the button can be used for deleting the device.
     * 
     * @method _onConnectOrRemoveDeviceClicked
     * @private
     * @param {Object} button
     */
    _onConnectOrRemoveDeviceClicked(button) {
        switch (button.label) {
            case _("Connect"):
                if (this.instance.isAuthenticated()) {
                    this.instance.getDeviceInfo()
                } else {
                    this.instance.authorizate();
                }
                break;

            case _("Remove"):
                if (this.instance.isConnected()) {
                    this.instance.deleteDeviceToken();
                    this.updateTab();
                }
                this.emit("remove-device");
                break;

        }
    };

    /**
     * Button handler emites the need of removing the device.
     * Removed from settings too.
     * 
     * @method _onRemoveDeviceClicked
     * @private
     * @param {Object} button
     */
    _onRemoveDeviceClicked(button) {
        if (this.instance.isConnected()) {
            this.instance.deleteDeviceToken();
            this.updateTab();
        }
        this.emit("remove-device");
    };
});

/**
 * PrefsWidget object. Main preferences widget.
 * 
 * @class PrefsWidget
 * @constructor
 * @return {Object} gtk Box
 */
 const PrefsWidget = GObject.registerClass({
    GTypeName: 'NanoPrefsWidget',
    Template: Me.dir.get_child('ui/prefs.ui').get_uri(),
    InternalChildren: [
        'devicesNotebook',
        'positionInPanelComboBox',
        'iconPackComboBox',
        'forceEnglishSwitch',
        'connectionTimeoutComboBox',
        'debugSwitch',
        'aboutVersion',
    ],
}, class PrefsWidget extends Gtk.Box {

    _init() {
        super._init();

        this._devicesTabs = {};
        this._devicesTabsLabels = {};
        this._discoveredDevices = {};
        this._devices = {};

        this._settings = ExtensionUtils.getSettings(Utils.NANOLIGHTS_SETTINGS_SCHEMA);
        this._settings.connect("changed", () => {
            /* TODO
            if (this._refreshPrefs) {
                this.getPrefsWidget();
                this._refreshPrefs = false;
            }
            */
        });

        this._avahi = new Avahi.Avahi({ service: "_nanoleafapi._tcp"});
        this._avahi.connect(
            "finished",
            () => {
                this._discoveredDevices = this._avahi.discovered;
                this._updateDeviceTabs();
            }
        );
        this._avahi.discover();


        this.readSettings();

        this._updateDeviceTabs();
        this._updateGeneral();
        this._updateAdvanced();

        this._aboutVersion.label = `${Me.metadata.name}, ` + _("version") + `: ${Me.metadata.version}, Copyright (c) 2022 Václav Chlumský`;
    }

    /**
     * Reads settings into class variables.
     *
     * @method readSettings
     */
     readSettings() {

        this._devices = this._settings.get_value(Utils.NANOLIGHTS_SETTINGS_DEVICES).deep_unpack();
        this._indicatorPosition = this._settings.get_enum(Utils.NANOLIGHTS_SETTINGS_INDICATOR);
        this._forceEnglish = this._settings.get_boolean(Utils.NANOLIGHTS_SETTINGS_FORCE_ENGLISH);
        this._connectionTimeout = this._settings.get_int(Utils.NANOLIGHTS_SETTINGS_CONNECTION_TIMEOUT);
        Utils.debug = this._settings.get_boolean(Utils.NANOLIGHTS_SETTINGS_DEBUG);
        this._iconPack = this._settings.get_enum(Utils.NANOLIGHTS_SETTINGS_ICONPACK);
    }

    /**
     * Write setting of devices
     *
     * @method writeDevicesSettings
     */
    writeDevicesSettings() {
        this._settings.set_value(
            Utils.NANOLIGHTS_SETTINGS_DEVICES,
            new GLib.Variant(
                Utils.NANOLIGHTS_SETTINGS_DEVICES_TYPE,
                this._devices
            )
        );
    }

    /**
     * Button handler initates discovering devices in the network.
     * 
     * @method _onDiscoverDevicesClicked
     * @private
     * @param {Object} button
     */
    _onDiscoverDevicesClicked(button) {
        this._avahi.discover();
    }

    /**
     * Button handler for adding a new device manually.
     * Opens dialog with ip adress input.
     * 
     * @method _onAddDeviceClicked
     * @private
     * @param {Object} button
     */
    _onAddDeviceClicked(button) {
        
        let addDeviceIpDialog = new AddDeviceIpDialog(this.get_ancestor(Gtk.Window));

        let signal = addDeviceIpDialog.connect(
            "ip-address-ok",
            () => {
                if (addDeviceIpDialog.ip.length === 0) {
                    Utils.logDebug("IP address is empty. Skiping.");
                    return;
                }


                let tab = this._createTab(
                    addDeviceIpDialog.ip,
                    "na",
                    null
                );
    
                this._devicesTabs[addDeviceIpDialog.ip] = tab;
    
                this._devicesTabsLabels[addDeviceIpDialog.ip] =  new Gtk.Label({ label: addDeviceIpDialog.ip});
    
                this._devicesNotebook.append_page(
                    tab,
                    this._devicesTabsLabels[addDeviceIpDialog.ip]
                );
            }
        );

        addDeviceIpDialog.show();
    }

    _createTab(tabIp, tabDeviceId, data) {
        let tab = new DeviceTab(tabIp, tabDeviceId, data);

        tab.connect(
            "update",
            () => {
                let update = tab.instance.export();

                for (let id in update) {
                    this._devices[id] = update[id];

                    let ip = update[id]["ip"];
                    let name = update[id]["name"];
                    this._devicesTabsLabels[ip].label = name;
                }

                this.writeDevicesSettings();
            }
        );

        tab.connect(
            "remove-device",
            () => {
                let update = tab.instance.export();

                this._devicesNotebook.detach_tab(
                    this._devicesTabs[tabIp]
                );

                delete(this._devicesTabs[tabIp]);

                for (let id in update) {
                    delete(this._devices[id]);
                }

                this.writeDevicesSettings();
            }
        );

        return tab;
    }

    /**
     * Creates a new tab for devices without a tab and makes the tab ready for use.
     * 
     * @method _updateDeviceTabs
     * @private
     */
    _updateDeviceTabs() {

        /* stored devices */
        for (let id in this._devices) {
            if (Object.keys(this._devicesTabs).includes(this._devices[id]["ip"])) {
                continue;
            }

            let tab = this._createTab(
                this._devices[id]["ip"],
                id,
                this._devices[id]
            );

            this._devicesTabs[this._devices[id]["ip"]] = tab;

            this._devicesTabsLabels[this._devices[id]["ip"]] =  new Gtk.Label({ label: this._devices[id]["name"]});

            this._devicesNotebook.append_page(
                tab,
                this._devicesTabsLabels[this._devices[id]["ip"]]
            );
        }

        /* discovered devices */
        for (let ip in this._discoveredDevices) {
            if (Object.keys(this._devicesTabs).includes(ip)) {
                continue;
            }

            let tab = this._createTab(
                ip,
                "na",
                this._discoveredDevices[ip]
            );

            this._devicesTabs[ip] = tab;

            this._devicesTabsLabels[ip] = new Gtk.Label({ label: this._discoveredDevices[ip]["hostname"]});

            this._devicesNotebook.append_page(
                tab,
                this._devicesTabsLabels[ip]
            );
        }
    }

    /**
     * Update general settings based on stored settings.
     * 
     * @method _updateGeneral
     * @private
     */
    _updateGeneral() {
        this._positionInPanelComboBox.set_active(this._indicatorPosition);
        this._iconPackComboBox.set_active(this._iconPack);
        this._forceEnglishSwitch.set_active(this._forceEnglish);
    }

    /**
     * Combobox handler of changing position in panel.
     * The value is stored in settings.
     * 
     * @method _positionInPanelChanged
     * @private
     * @param {Object} combobox
     */
    _positionInPanelChanged(comboBox) {
        this._indicatorPosition = comboBox.get_active();
        this._settings.set_enum(
            Utils.NANOLIGHTS_SETTINGS_INDICATOR,
            this._indicatorPosition
        );
    }

    /**
     * Combobox handler of changing bright/dark icons.
     * The value is stored in settings.
     * 
     * @method _iconPackChanged
     * @private
     * @param {Object} combobox
     */
    _iconPackChanged(comboBox) {
        this._iconPack = comboBox.get_active();
        this._settings.set_enum(
            Utils.NANOLIGHTS_SETTINGS_ICONPACK,
            this._iconPack
        );
    }

    /**
     * Switch handler of forcing english language of the extension.
     * The value is stored in settings.
     * 
     * @method _forceEnglishNotifyActive
     * @private
     * @param {Object} switch
     */
    _forceEnglishNotifyActive(forceEnglishSwitch) {
        this._forceEnglish = forceEnglishSwitch.get_active();
        this._settings.set_boolean(
            Utils.NANOLIGHTS_SETTINGS_FORCE_ENGLISH,
            this._forceEnglish
        );
    }

    /**
     * Update advanced settings based on stored settings.
     * 
     * @method _updateAdvanced
     * @private
     */
    _updateAdvanced() {
        this._connectionTimeoutComboBox.set_active(this._connectionTimeout - 1);
        this._debugSwitch.set_active(Utils.debug);
    }

    /**
     * Combobox handler of changing device timeout.
     * The value is stored in settings.
     * 
     * @method _connectionTimeoutChanged
     * @private
     * @param {Object} combobox
     */
    _connectionTimeoutChanged(comboBox) {
        this._connectionTimeout = comboBox.get_active() + 1;
        this._settings.set_int(
            Utils.NANOLIGHTS_SETTINGS_CONNECTION_TIMEOUT,
            this._connectionTimeout
        );
    }

    /**
     * Switch handler of enabling debug messages.
     * The value is stored in settings.
     * 
     * @method _debugNotifyActive
     * @private
     * @param {Object} switch
     */
    _debugNotifyActive(debugSwitch) {
        Utils.debug = debugSwitch.get_active();
        this._settings.set_boolean(
            Utils.NANOLIGHTS_SETTINGS_DEBUG,
            Utils.debug
        );
    }
});

/**
 * Like `extension.js` this is used for any one-time setup like translations.
 *
 * @method init
 */
function init() {

    ExtensionUtils.initTranslations();
}

/**
 * This function is called when the preferences window is first created to build
 * and return a Gtk widget.
 *
 * @method buildPrefsWidget
 * @return {Object} returns the prefsWidget
 */
function buildPrefsWidget() {
    return new PrefsWidget();
}