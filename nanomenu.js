'use strict';

/**
 * extension panel menu class
 * JavaScript Gnome extension for Nanoleaf - Main Menu.
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

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const GObject = imports.gi.GObject;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const NanoApi = Me.imports.nanoapi;
const Slider = imports.ui.slider;

const Gettext = imports.gettext.domain('nano-lights');
var forceEnglish = ExtensionUtils.getSettings(
    Utils.NANOLIGHTS_SETTINGS_SCHEMA
).get_boolean(Utils.NANOLIGHTS_SETTINGS_FORCE_ENGLISH);
const _ = forceEnglish ? (a) => { return a; } : Gettext.gettext;

const NanoMenuPosition = {
    CENTER: 0,
    RIGHT: 1,
    LEFT: 2
};

const IconSize = 20;

var NanoIconPack = {
    NONE: 0,
    BRIGHT: 1,
    DARK: 2
};

var NanoRefreshItems = {
    SWITCH_VALUE: 0,
    SWITCH_COLOR: 1,
    SLIDER_BRIGHTNESS: 2,
    SLIDER_COLOR: 3
}

var NanoEvents = {
    SWITCH: 0,
    BRIGHTNESS: 2,
}

var NanoPanelMenu = GObject.registerClass({
    GTypeName: 'NanoPanelMenu',
}, class NanoPanelMenu extends PanelMenu.Button {

    /**
     * NanoPanelMenu class initialization
     *  
     * @method _init
     * @private
     */
    _init() {
        super._init(0.0, Me.metadata.name, false);

        this._signals = {};
        this._rebuildingMenu = false;
        this._instances = {};
        this._infoData = {};
        this._openMenuDefault = null;
        this._nanoMenu = {}

        this._duration = 1;

        let signal;

        let icon = new St.Icon({
            gicon : Gio.icon_new_for_string(Me.dir.get_path() + '/media/leaf-lights.svg'),
            style_class : 'system-status-icon',
        });

        let iconEffect = this._getIconBriConEffect(NanoIconPack.BRIGHT);
        icon.add_effect(iconEffect);

        this.add_child(icon);

        this._settings = ExtensionUtils.getSettings(Utils.NANOLIGHTS_SETTINGS_SCHEMA);
        signal = this._settings.connect("changed", () => {
            if (this.readSettings()) {
                this.rebuildMenuStart();
            }
        });
        this._appendSignal(signal, this._settings, false);

        this.readSettings();

        signal = this.menu.connect("open-state-changed", () => {
            if (this.menu.isOpen) {
                this.checkInstances();

                if (this._openMenuDefault !== null){
                    this._openMenuDefault.open(false);
                }
            }
        });
        this._appendSignal(signal, this.menu, false);

        Utils.debug = true;
        Utils.logDebug(JSON.stringify(this.devices));

        this.rebuildMenuStart();
    }

    /**
     * Append signal to the dictionary with signals.
     * 
     * @method _appendSignal
     * @private
     * @param {Number} signal number
     * @param {Object} object signal is connected
     * @param {Boolean} disconnect all signals
     * @param {Boolean} disconnect temporal signals
     */
     _appendSignal(signal, object, rebuild, tmp = false) {
        this._signals[signal] = {
            "object": object,
            "rebuild": rebuild,
            "tmp": tmp
        }
    }

    /**
     * Reads settings into class variables.
     * 
     * @method readSettings
     * @return {Boolean} True if the menu needs rebuild.
     */
     readSettings() {

        let menuNeedsRebuild = false;
        let tmpVal;

        /**
         * this.devices needs rebuild
         */
         tmpVal = JSON.stringify(this.devices);

         this.devices = this._settings.get_value(
             Utils.NANOLIGHTS_SETTINGS_DEVICES
         ).deep_unpack();
 
         if (tmpVal !== JSON.stringify(this.devices)) {
             menuNeedsRebuild = true;
         }

        /**
         * debug doesn't need rebuild
         */
        Utils.debug = this._settings.get_boolean(
            Utils.NANOLIGHTS_SETTINGS_DEBUG
        );

        /**
         * this._iconPack needs rebuild
         */
        tmpVal = this._iconPack;

        this._iconPack = this._settings.get_enum(
            Utils.NANOLIGHTS_SETTINGS_ICONPACK
        );

        if (tmpVal !== this._iconPack) {
            menuNeedsRebuild = true;
        }

        /**
         * this._indicatorPosition doesn't need rebuild
         */
        this._indicatorPosition = this._settings.get_enum(
            Utils.NANOLIGHTS_SETTINGS_INDICATOR
        );

        /**
         * this._connectionTimeout doesn't need rebuild
         */
        this._connectionTimeout = this._settings.get_int(
            Utils.NANOLIGHTS_SETTINGS_CONNECTION_TIMEOUT
        );

        /**
         * this._menuSelected doesn't need rebuild
         */
        this._menuSelected = this._settings.get_value(
            Utils.NANOLIGHTS_SETTINGS_MENU_SELECTED
        ).deep_unpack();

        return menuNeedsRebuild;
    }

    /**
     * Wite setting for current selection in menu
     *
     * @method writeMenuSelectedSettings
     */
    writeMenuSelectedSettings() {

        this._settings.set_value(
            Utils.NANOLIGHTS_SETTINGS_MENU_SELECTED,
            new GLib.Variant(
                Utils.NANOLIGHTS_SETTINGS_MENU_SELECTED_TYPE,
                this._menuSelected
            )
        );
    }
    _connectDeviceInstance(id) {
        let signal;

        signal = this._instances[id].connect(
            "info-data",
            () => {
                this._infoData[id] = {};

                if (this._instances[id].isConnected()) {
                    this._infoData[id] = this._instances[id].getAsyncData();
                }

                this._checkRebuildReady(id);

                /*
                if (this.bridgeInProblem[bridgeid] !== undefined &&
                    this.bridgeInProblem[bridgeid]) {

                        if ((! this._bridgesInMenuShowed.includes(bridgeid)) &&
                            (! this._bridgesInMenuShowed.includes(this._defaultBridgeInMenu))
                            ) {

                            this.rebuildMenuStart();
                        } else {
                            this._refreshBridgeMainLabel(bridgeid);
                        }
                }
                this.bridgeInProblem[bridgeid] = false;
*/
                if (this._rebuildingMenu === false) {
                    this.refreshMenu();
                }
            }
        );
        this._appendSignal(signal, this._instances[id], true);

        signal = this._instances[id].connect(
            "change-occurred",
            () => {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._duration * 1000 + 100, () => {
                    this._checkInstance(id);
                });                
            }
        );
        this._appendSignal(signal, this._instances[id], true);
    }

    _updateInstance(id) {
        if (this.devices[id]["ip"] === undefined) {
            Utils.logError(`Device ${id} misses ip address`);
            return
        }

        if (this._instances[id] === undefined) {
            this._instances[id] = new NanoApi.Nano({
                id: id,
                ip: this.devices[id]["ip"]
            });
            this._connectDeviceInstance(id);
        }

        this._instances[id].update(this.devices[id]);
    }

    checkInstances() {
        for (let i in this._instances) {
            /* this will invoke this.refreshMenu via "info-data" */
            this._checkInstance(i);
    }
    }

    _checkInstance(id) {
        this._instances[id].getDeviceInfo();
    }

    /**
     * Returns effect that can be applied on icon
     * 
     * @method _getIconColorEffect
     * @private
     * @param {Enum} requested icon effect
     * @return {Object} effect
     */
     _getIconColorEffect(reqEffect) {

        let color;
        switch (reqEffect) {

            case NanoIconPack.BRIGHT:

                color = new Clutter.Color({
                    red: 237,
                    green: 237,
                    blue: 237,
                    alpha: 255
                });
                break;

            case NanoIconPack.DARK:

                color = new Clutter.Color({
                    red: 40,
                    green: 40,
                    blue: 40,
                    alpha: 255
                });
                break;

            default:
        }

        let effect = new Clutter.ColorizeEffect({tint: color});
        return effect;
    }

    /**
     * Returns effect that can be applied on icon
     * 
     * @method _getIconBriConEffect
     * @private
     * @param {Enum} requested icon effect
     * @return {Object} effect
     */
    _getIconBriConEffect(reqEffect) {

        let bri = 0.0;
        let cont = 0.0;

        let effect = new Clutter.BrightnessContrastEffect();
        switch (reqEffect) {

            case NanoIconPack.BRIGHT:

                bri = 0.8;
                cont = 0.2;
                break;

            case NanoIconPack.DARK:

                bri = 0.2;
                cont = 0.2;
                break;

            default:
        }

        effect.set_brightness(bri);
        effect.set_contrast(cont);
        return effect;
    }

    /**
     * Get gnome icon by name.
     * 
     * @method _getGnomeIcon
     * @private
     * @param {String} path to icon
     * @return {Object} icon or null if not found
     */
    _getGnomeIcon(iconName) {

        let icon = null;
        let themeContext = St.ThemeContext.get_for_stage(global.stage);

        try {

            icon = new St.Icon({
                gicon : Gio.ThemedIcon.new(iconName),
                style_class : 'system-status-icon',
                y_expand: false,
                y_align: Clutter.ActorAlign.CENTER
            });

            icon.set_size(IconSize * themeContext.scaleFactor * 0.8, IconSize * themeContext.scaleFactor * 0.8);

            let iconEffect = this._getIconColorEffect(this._iconPack);
            icon.add_effect(iconEffect);

            iconEffect = this._getIconBriConEffect(this._iconPack);
            icon.add_effect(iconEffect);

        } catch(e) {
            logError(e, `Failed to get gnome icon: ${iconName}`);
            return null;
        }

        return icon;
    }

    /**
     * Read icon from FS and return icon.
     * 
     * @method _getIconByPath
     * @private
     * @param {String} path to icon
     * @return {Object} icon or null if not found
     */
    _getIconByPath(iconPath) {

        let icon = null;
        let themeContext = St.ThemeContext.get_for_stage(global.stage);

        try {

            icon = new St.Icon({
                gicon : Gio.icon_new_for_string(iconPath),
                style_class : 'system-status-icon',
                y_expand: false,
                y_align: Clutter.ActorAlign.CENTER
            });

            icon.set_size(IconSize * themeContext.scaleFactor, IconSize * themeContext.scaleFactor);

            let iconEffect = this._getIconBriConEffect(this._iconPack);
            icon.add_effect(iconEffect);

        } catch(e) {
            logError(e, `Failed to get icon: ${iconPath}`);
            return null;
        }

        return icon;
    }

    /**
     * Creates refresh and settings items for the menu.
     * 
     * @method _createDefaultSettingsItems
     * @private
     * @param {Object} function called on refresh
     * @returns {Array} array of menu items
     */
     _createDefaultSettingsItems(rebuildFunction = this.rebuildMenuStart) {
        let items = [];
        let icon;
        let signal;

        /**
         * Refresh menu item
         */
         let refreshMenuItem = new PopupMenu.PopupMenuItem(
            _("Refresh menu")
        );

        if (this._iconPack !== NanoIconPack.NONE) {
            icon = this._getGnomeIcon("emblem-synchronizing-symbolic");

            if (icon !== null){
                refreshMenuItem.insert_child_at_index(icon, 1);
            }
        }

        signal = refreshMenuItem.connect(
            'button-press-event',
            () => {
                rebuildFunction();
            }
        );
        this._appendSignal(signal, refreshMenuItem, true, true);

        items.push(refreshMenuItem);

        /**
         * Settings menu item
         */
        let prefsMenuItem = new PopupMenu.PopupMenuItem(
            _("Settings")
        );

        if (this._iconPack !== NanoIconPack.NONE) {
            icon = this._getGnomeIcon("emblem-system");

            if (icon !== null) {
                prefsMenuItem.insert_child_at_index(icon, 1);
            }
        }

        signal = prefsMenuItem.connect(
            'button-press-event',
            () => { ExtensionUtils.openPrefs(); }
        );
        this._appendSignal(signal, prefsMenuItem, true, true);
        items.push(prefsMenuItem);

        return items;
    }

    /**
     * Creates Refresh menu item and
     * settings item. Items can be in one item
     * or multipe items.
     * 
     * @method _createSettingItems
     * @private
     * @param {Boolean} true for reduced number of items
     * @return {Object} array of menu items
     */
    _createSettingItems(reduced) {
        let items = [];

        let settingsItems = this._createDefaultSettingsItems(
            this.rebuildMenuStart.bind(this)
        );
        for (let settingsItem of settingsItems) {
            items.push(settingsItem);
        }

        return items;
    }

    /**
     * Sets the color of slider
     * 
     * @method _setSliderColor
     * @private
     * @param {Object} slider
     * @param {Array} array with RGB
     */
    _setSliderColor(object, [r, g, b]) {
        r = ('0' + r.toString(16)).slice(-2);
        g = ('0' + g.toString(16)).slice(-2);
        b = ('0' + b.toString(16)).slice(-2);

        let styleColor = `#${r}${g}${b}`;

        object.style = `-barlevel-active-background-color: ${styleColor}; -barlevel-active-border-color: ${styleColor}`;
    }

    /**
     * Sets the color of switch
     * 
     * @method _setSwitchColor
     * @private
     * @param {Object} switch
     * @param {Array} array with RGB
     */
    _setSwitchColor(object, [r, g, b]) {
        let color = new Clutter.Color({
            red: r,
            green: g,
            blue: b,
            alpha: 255
        });

        object.clear_effects();

        let colorEffect = new Clutter.ColorizeEffect({tint: color});
        object.add_effect(colorEffect);

        let briConEffect = new Clutter.BrightnessContrastEffect();
        briConEffect.set_brightness(0.4);
        briConEffect.set_contrast(0.4);

        object.add_effect(briConEffect);
    }

    /**
     * Colorizes switches based on light color.
     * 
     * @method _createLightSwitch
     * @private
     * @param {Object} switchItem to colorize
     * @param {String} bridgeid
     * @param {Number} lightid
     * @param {Number} groupid
     * @param {Boolean} tmp: true for tmp refresh
     */
     _createSwitchColor(switchItem, data, id) {

        let path = `${this._rndID()}::device::${id}::color`;

        this.refreshMenuObjects[path] = {
            "id": id,
            "object":switchItem,
            "type": NanoRefreshItems.SWITCH_COLOR
        }
    }

    /**
     * Colorizes slideres based on light color.
     * 
     * @method _createLightSwitch
     * @private
     * @param {Object} slider to colorize
     * @param {String} bridgeid
     * @param {Number} lightid
     * @param {Number} groupid
     * @param {Boolean} tmp: true for tmp refresh
     */
    _createSliderColor(slider, data, id) {

        let path = `${this._rndID()}::device::${id}::color`;

        this.refreshMenuObjects[path] = {
            "id": id,
            "object":slider,
            "type": NanoRefreshItems.SLIDER_COLOR
        }
    }

    _getColor(data, id) {
        let [r, g, b] = [0, 0, 0];

        if (id === "all") {
            let counter = 0;

            for (let subId in data) {
                if (!this._getDeviceOn(data, subId)) {
                    continue;
                }

                let [subR, subG, subB] = this._getColor(data, subId);

                if (subR > 0 || subG > 0 || subB > 0) {
                    r = r + subR;
                    g = g + subG;
                    b = b + subB;
                    counter++;
                }
            }

            if (counter === 0) {
                return [0, 0, 0];
            }

            return [r / counter, g / counter, b / counter];
        }

        if (data[id] === undefined) {
            return [0, 0, 0];
        }

        if (data[id]["state"] === undefined) {
            return [0, 0, 0];
        }

        if (data[id]["state"]["on"]["value"] === false) {
            return [0, 0, 0];
        }

        let h = data[id]["state"]["hue"]["value"] / (1.0 * data[id]["state"]["hue"]["max"]);
        let s = data[id]["state"]["sat"]["value"] / 100.0;
        //let l = data[id]["state"]["brightness"]["value"] / 100.0;

        return Utils.hslToRgb(h, s, 0.5);
    }

    _getBrightness(data, id) {

        if (id === "all") {
            let res = 0;
            let counter = 0;

            for (let subId in data) {
                let subRes = this._getBrightness(data, subId);
                
                if (subRes > 0) {
                    res = res + subRes;
                    counter++;
                }
            }

            if (counter === 0) {
                return 0;
            }
            
            return res / counter;
        }

        if (data[id] === undefined) {
            return 0;
        }

        if (data[id]["state"] === undefined) {
            return 0;
        }

        if (data[id]["state"]["on"]["value"] === false) {
            return 0;
        }

        let bri = data[id]["state"]["brightness"]["value"];

        return (bri / 100.0) * 255;
    }

    _getDeviceOn(data, id) {
        if (id === "all") {
            for (let subId in data) {
                if (this._getDeviceOn(data, subId)) {
                    return true;
                }
            }

            return false;
        }

        if (data[id] === undefined) {
            return false;
        }

        if (data[id]["state"] === undefined) {
            return false;
        }

        if (data[id]["state"]["on"]["value"] === true) {
            return true;
        }

        return false;
    }

    /**
     * Creates slider for controlling the brightness
     * 
     * @method _createBrightnessSlider
     * @private
     * @param {String} bridgeid
     * @param {Number} lightid
     * @param {Number} groupid
     * @return {Object} Brightness slider
     */
     _createDeviceSlider(data, id) {

        let path = "";
        let themeContext = St.ThemeContext.get_for_stage(global.stage);

        let slider = new Slider.Slider(0);
        slider.set_width(180 * themeContext.scaleFactor);
        slider.set_height(25);
        slider.set_x_align(Clutter.ActorAlign.START);
        slider.set_x_expand(false);
        slider.value = 0;

        this._createSliderColor(slider, data, id);

        path = `${this._rndID()}::device::${id}::state::brightness`;

        slider.connect(
            "drag-end",
            this._menuEventHandler.bind(
                this,
                {
                    "path": path,
                    "id": id,
                    "object":slider,
                    "type": NanoEvents.BRIGHTNESS
                }
            )
        );

        this.refreshMenuObjects[path] = {
            "id": id,
            "object":slider,
            "type": NanoRefreshItems.SLIDER_BRIGHTNESS
        }

        return slider;
    }

    _createDeviceSwitch(data, id) {
        let switchBox;
        let switchButton;

        let path = `${this._rndID()}::device::${id}::switch`;

        switchBox = new PopupMenu.Switch(false);
        switchButton = new St.Button({reactive: true, can_focus: true});
        switchButton.set_x_align(Clutter.ActorAlign.END);
        switchButton.set_x_expand(false);
        switchButton.child = switchBox;
        switchButton.connect(
            "button-press-event",
            () => {
                switchBox.toggle();
            }
        );
        switchButton.connect(
            "button-press-event",
            this._menuEventHandler.bind(
                this,
                {
                    "path": path,
                    "id": id,
                    "object":switchBox,
                    "type": NanoEvents.SWITCH
                }
            )
        );

        this.refreshMenuObjects[path] = {
            "id": id,
            "object":switchBox,
            "type": NanoRefreshItems.SWITCH_VALUE
        }

        this._createSwitchColor(switchBox, data, id);

        return switchButton;
    }

    _createNanoDevice(data, id = "all") {
        let item;
        let icon = null;
        let name = _("All")

        if (id !== "all") {
            name = data[id]["name"];
        }

        item = new PopupMenu.PopupMenuItem(name);

        let label = item.label
        item.remove_child(item.label);
        let itemBox = new St.BoxLayout();
        itemBox.vertical = true;
        itemBox.add(label);

        itemBox.add(this._createDeviceSlider(data, id));

        item.insert_child_at_index(itemBox, 1);

        icon = null;
        if (icon !== null) {
            item.insert_child_at_index(icon, 1);
        }

        item.set_x_align(Clutter.ActorAlign.FILL);
        item.label.set_x_expand(true);

        item.add(this._createDeviceSwitch(data, id));

        item.originalActivate = item.activate;
        item.activate = (event) => {
            /**
             * activate function is used here becase
             * the menu.open(true) does not work with
             * 'button-press-event' signal correctly
             */

            if (id !== "all" && !this._instances[id].isConnected()) {
                return item.originalActivate(event);
            }

            this._menuSelected["nano"] = {"device": id}
            this.writeMenuSelectedSettings();

            this._selectNanoDevice(data, id);

            this._nanoMenu["devices"]["object"].menu.open(true);

            if (this._nanoMenu["devices"]["hidden-item"] !== undefined) {
                this._nanoMenu["devices"]["hidden-item"].visible = true;
            }

            item.visible = false;
            this._nanoMenu["devices"]["hidden-item"] = item;

            return item.originalActivate(event);
        }

        return [item];
    }

    _createNanoMenuDevices(data) {
        let menuItems = [];
        let items = [];

        let deviceSubMenu = new PopupMenu.PopupSubMenuMenuItem(
            _("No device selected")
        );

        /* disable closing menu on item activated */
        deviceSubMenu.menu.itemActivated = (animate) => {};

        let label = deviceSubMenu.label
        deviceSubMenu.remove_child(deviceSubMenu.label);
        let itemBox = new St.BoxLayout();
        itemBox.vertical = true;
        itemBox.add(label);
        deviceSubMenu.insert_child_at_index(itemBox, 1);

        this._nanoMenu["devices"] = {}
        this._nanoMenu["devices"]["object"] = deviceSubMenu;
        this._nanoMenu["devices"]["icon"] = null;
        this._nanoMenu["devices"]["box"] = itemBox;
        this._nanoMenu["devices"]["switch"] = null;
        this._nanoMenu["devices"]["slider"] = null;
        this._nanoMenu["devices"]["undo"] = null;
        this._nanoMenu["devices"]["selected"] = null;

        this._openMenuDefault = deviceSubMenu.menu;

        deviceSubMenu.connect(
            'button-press-event',
            () => {
                this.checkInstances();
            }
        );

        this._lastOpenedMenu = {"last": deviceSubMenu.menu, "opening": null};
        deviceSubMenu.menu.connect(
            'open-state-changed',
            (menu, isOpen) => {
                this._handleLastOpenedMenu(menu, isOpen);
            }
        );

        menuItems.push(deviceSubMenu);

        items = items.concat(
            this._createNanoDevice(data) // item for all device
        );

        items = items.concat(
            [new PopupMenu.PopupSeparatorMenuItem()]
        );

        for (let id in data) {

            if (Object.keys(data[id]).length === 0) {
                continue;
            }

            items = items.concat(
                this._createNanoDevice(data, id)
            );
        }

        for (let i in items) {
            deviceSubMenu.menu.addMenuItem(items[i]);
        }

        return menuItems;
    }

    _createNanoMenuControl(data) {
        let items = [];
        return items;
    }

    _createNanoMenuScenes(data) {
        let items = [];
        return items;
    }

    _createNanoMenu() {
        let items = [];

        if (this._infoData.length === 0) {
            return items;
        }

        items = items.concat(
            this._createNanoMenuDevices(this._infoData)
        );

        items = items.concat(
            this._createNanoMenuControl(this._infoData)
        );

        items = items.concat(
            this._createNanoMenuScenes(this._infoData)
        );

        return items;
    }

    _checkRebuildReady(id) {

        if (! this._rebuildingMenu) {
            return;
        }

        this._rebuildingMenuDevice[id] = true;


        for (let id in this._rebuildingMenuDevice) {
            if (this._rebuildingMenuDevice[id] === false) {
                return;
            }
        }

        this._rebuildingMenu = false;
        this._rebuildingMenuDevice = {};

        this._rebuildMenu();
    }

    /**
     * Sets timer to open last opened menu if menu is closed.
     * 
     * @method _handleLastOpenedMenu
     * @private
     * @param {Object} menu
     * @return {Boolean} is the menu opened
     */
    _handleLastOpenedMenu(menu, isOpen) {
        if (isOpen) {
            /* another menu opened instead, ignore timed event*/
            this._lastOpenedMenu["opening"] = null;
        }

        if (!isOpen && this._lastOpenedMenu["last"] !== null) {
            this._lastOpenedMenu["opening"] = this._lastOpenedMenu["last"];

            /**
             * sets timed event to open last closed menu
             * the timer is needed because if I open another menu
             * the first menu closes and without the timer I would open
             * different menu instad
             */
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                if (this._lastOpenedMenu["opening"] !== null) {
                    this._lastOpenedMenu["opening"].open(true);
                    this._lastOpenedMenu["opening"] = null;
                }
            });
        }

        if (!isOpen) {
            this._lastOpenedMenu["last"] = menu;
        }
    }

    _selectNanoDevice(data, id) {
        if(Object.keys(data).length === 0) {
            Utils.logDebug(`Can not select device. No data available.`);
        }

    }

    /**
     * Invokes rebuilding the menu.
     * 
     * @method rebuildMenuStart
     */
     rebuildMenuStart() {

        Utils.logDebug("Rebuilding menu started.");

        this._rebuildingMenu = true;
        this._rebuildingMenuDevice = {};
        this._mainLabel = {};

        this.disconnectSignals(false);

        let oldItems = this.menu._getMenuItems();
        for (let item in oldItems){
            oldItems[item].destroy();
        }

        for (let settingsItem of this._createSettingItems(true)) {
            this.menu.addMenuItem(settingsItem);
        }

        for (let id in this.devices) {
            this._rebuildingMenuDevice[id] = false;

            this._updateInstance(id);
        }

        this.checkInstances();

        /**
         * In case of not getting any response from some bridge
         * within the time
         * this will build menu for bridges that responded so far
         */
        let timeout = (this._connectionTimeout + 1) * 1000;
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeout, () => {
            if (this._rebuildingMenu) {
                Utils.logDebug("Not all devices responded. Rebuilding menu anyway.");

                this._rebuildingMenu = false;
                this._rebuildingMenuRes = {};

                this._rebuildMenu();
            }
        });
    }

    /**
     * Rebuild the menu from scratch
     * 
     * @method _rebuildMenu
     * @private
     */
    _rebuildMenu() {
        this.refreshMenuObjects = {};
        this._openMenuDefault = null;

        this.disconnectSignals(false, true);

        let oldItems = this.menu._getMenuItems();
        for (let item in oldItems){
            oldItems[item].destroy();
        }

        Utils.logDebug("Rebuilding nano menu.");

        let nanoMenu = this._createNanoMenu();

        for (let item in nanoMenu) {
            this.menu.addMenuItem(nanoMenu[item]);
        }

        if (nanoMenu.length == 0) {
            for (let item of this._createSettingItems()) {
                this.menu.addMenuItem(item);
            }
        }
    }

    /**
     * Handles events generated by menu items.
     * 
     * @method _menuEventHandler
     * @private
     * @param {Object} dictionary with instruction what to do
     */
    _menuEventHandler(data) {
        let id = data["id"];
        let type = data["type"];
        let object = data["object"];
        let path = data["path"];

        let value;

        let parsedPath = [];

        if (id === "all") {
            for (let subId in this._instances) {
                data["id"] = subId;
                this._menuEventHandler(data);
            }

            return;
        }

        if (Object.keys(this._infoData[id]).length === 0) {
            Utils.logDebug(`Device ${id} has no data.`);
            return;
        }

        if (!this._instances[id].isConnected()) {
            Utils.logDebug(`Device ${id} not connected.`);
            return;
        }

        Utils.logDebug(`Menu event handler type: ${type}, ${id}, ${path}`);

        parsedPath = path.split("::");

        switch(type) {

            case NanoEvents.SWITCH:

                value = object.state;

                this._instances[id].setDeviceState(value);
                break;

            case NanoEvents.BRIGHTNESS:

                value = Math.round(object.value * 100);

                this._instances[id].setDeviceBrightness(value, this._duration);

                break;
            default:
                Utils.logDebug(`Menu event handler - uknown type ${type}`)
        }

        /* don't call this.refreshMenu() now... it will by called async */
    }

    /**
     * Generate almost useless ID number
     * 
     * @method _rndID
     * @private
     * @return {Number} randomly generated number
     */
    _rndID() {

        /* items in this.refreshMenuObjects may occure more then ones,
         * this way it is possible - otherwise, the ID is useless
         */
        return Math.round((Math.random()*1000000));
    }

    refreshMenu() {
        let id = "";
        let type = "";
        let object = null;
        let parsedPath = [];
        let value;
        let r = 0;
        let g = 0;
        let b = 0;

        Utils.logDebug("Refreshing bridge menu.");

        for (let path in this.refreshMenuObjects) {

            id = this.refreshMenuObjects[path]["id"];
            object = this.refreshMenuObjects[path]["object"];
            type = this.refreshMenuObjects[path]["type"];

            parsedPath = path.split("::");

            switch (type) {

                case NanoRefreshItems.SWITCH_VALUE:
                    value = this._getDeviceOn(this._infoData, id);

                    if (object.state !== value) {
                        object.state = value;
                    }

                    break;

                case NanoRefreshItems.SWITCH_COLOR:
                    if (this._getDeviceOn(this._infoData, id)) {
                        value = this._getColor(this._infoData, id);
                    } else {
                        object.clear_effects();
                        break;
                    }

                    this._setSwitchColor(object, value);

                    break;

                case NanoRefreshItems.SLIDER_BRIGHTNESS:
                    if (this._getDeviceOn(this._infoData, id)) {
                        value = this._getBrightness(this._infoData, id) / 255;
                    } else {
                        value = 0;
                    }

                    if (object.value !== value) {
                        object.value = value;
                    }
                    break;

                case NanoRefreshItems.SLIDER_COLOR:
                    if (this._getDeviceOn(this._infoData, id)) {
                        value = this._getColor(this._infoData, id);
                    } else {
                        object.style = null;
                        break;
                    }

                    this._setSliderColor(object, value);

                    break;

                default:
                    break;
            }
        }
    }

    /**
     * Disconect signals
     * 
     * @method disconnectSignals
     * @param {Boolean} disconnect all
     * @param {Boolean} disconnect only tmp signals and return
     */
     disconnectSignals(all, onlyTmp = false) {
        let toDisconnect = "rebuild";

        if (onlyTmp) {
            toDisconnect = "tmp";
        }

        for (let id in this._signals) {
            if (this._signals[id][toDisconnect] || all) {
                try {
                    this._signals[id]["object"].disconnect(id);
                    delete(this._signals[id]);
                } catch {
                    continue;
                }
            }
        }
    }
});