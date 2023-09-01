'use strict';

/**
 * extension panel menu class
 * JavaScript Gnome extension for Nanoleaf - Main Menu.
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


import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import {Extension, gettext} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Utils from './utils.js';
import * as NanoApi from './nanoapi.js';
import * as ColorPicker from './colorpicker.js';

const __ = gettext;

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
    COLOR_PICKER: 3,
    EFFECT: 4,
}

/**
 * NanoPanelMenu class. Provides widget with menu items.
 * 
 * @class NanoPanelMenu
 * @constructor
 * @return {Object} menu widget instance
 */
export var NanoPanelMenu = GObject.registerClass({
    GTypeName: 'NanoPanelMenu',
}, class NanoPanelMenu extends PanelMenu.Button {

    /**
     * NanoPanelMenu class initialization
     *  
     * @method _init
     * @private
     */
    _init(name, mainDir, settings, openPref) {
        super._init(0.0, name, false);

        this._ = Utils.checkGettextEnglish(__, settings);

        this._timers = [];
        this._signals = {};
        this._rebuildingMenu = false;
        this._instances = {};
        this._infoData = {};
        this._allEffects = {};
        this._openMenuDefault = null;
        this._nanoMenu = {}
        this._mainDir = mainDir;
        this._openPref = openPref;

        this._brightnessDuration = 1;

        let signal;

        let box = new St.BoxLayout({style_class: 'panel-status-menu-box'});

        let icon = new St.Icon({
            gicon : Gio.icon_new_for_string(this._mainDir.get_path() + '/media/leaf-lights.svg'),
            style_class : 'system-status-icon',
        });

        this.style = `-natural-hpadding: 6px; -minimum-hpadding: 6px;`;

        let iconEffect = this._getIconBriConEffect(NanoIconPack.BRIGHT);
        icon.add_effect(iconEffect);

        this._icon = icon;
        box.add_child(icon);
        this.add_child(box);

        this._settings = settings;
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

        /* if the desktop is starting up, wait until starting is finished */
        this._startingUpSignal = undefined;
        if (Main.layoutManager._startingUp) {
            this._startingUpSignal = Main.layoutManager.connect(
                "startup-complete",
                () => {
                    Main.layoutManager.disconnect(this._startingUpSignal);
                    this._startingUpSignal = undefined;

                    this.rebuildMenuStart();
                    this._setScreenChangeDetection(
                        this.rebuildMenuStart.bind(this)
                    );
                }
            );
        } else {
            this.rebuildMenuStart();
            this._setScreenChangeDetection(
                this.rebuildMenuStart.bind(this)
            );
        }
    }

    /**
     * Connects signals with change of displays
     * to rebuild menu and detect new displays or change display scale.
     *
     * @method _setScreenChangeDetection
     * @private
     */
    _setScreenChangeDetection(screenChangeFunction = this.rebuildMenuStart) {

        let signal;

        signal = Main.layoutManager.connect(
            "monitors-changed",
            () => {
                screenChangeFunction();
            }
        );
        this._appendSignal(signal, Main.layoutManager, false);
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
     _appendSignal(signal, object, rebuild, permanent = true) {
        this._signals[signal] = {
            "object": object,
            "rebuild": rebuild,
            "permanent": permanent
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
            this._instances = {};
            this._infoData = {};
        }

        /**
         * debug doesn't need rebuild
         */
        Utils.setDebug(this._settings.get_boolean(
            Utils.NANOLIGHTS_SETTINGS_DEBUG
        ));

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

        this.setPositionInPanel();

        for (let id in this._instances) {
            this._instances[id].setConnectionTimeout(this._connectionTimeout);
        }

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

    getKnownDevices() {
        let known = [];
        for (let id in this._infoData) {
            if (this._instances[id].isConnected())
                known.push(id);
        }

        return known;
    }

    _connectDeviceInstance(id) {
        let signal;

        signal = this._instances[id].connect(
            "info-data",
            () => {
                if (this._rebuildingMenu) {
                    /* menu is being rebuilded */
                    this._infoData[id] = {};

                    if (this._instances[id].isConnected()) {
                        this._infoData[id] = this._instances[id].getAsyncData();
                    }
    
                    this._checkRebuildReady(id);
                } else {
                    /* we think we know all devices */
                    if (this._infoData[id] === undefined) {
                        /* we dont...  */

                        this._infoData[id] = {};

                        if (this._instances[id].isConnected()) {
                            this._infoData[id] = this._instances[id].getAsyncData();
                        }

                        /* we rebild menu again */
                        this._rebuildMenu();
                    } else {
                        /* this is common situation */
                        if (this._instances[id].isConnected()) {
                            this._infoData[id] = this._instances[id].getAsyncData();
                        }

                        this.refreshMenu();

                        /* just check if any unkown instance */
                        let knownDevices = this.getKnownDevices()
                        for (let testMe in this._instances) {
                            if (knownDevices.includes(testMe)) {
                                continue;
                            }

                            this._checkInstance(testMe);
                        }
                    }
                }
            }
        );
        this._appendSignal(signal, this._instances[id], true);

        signal = this._instances[id].connect(
            "all-effects",
            () => {
                if (this._instances[id].isConnected()) {
                    this._allEffects[id] = this._instances[id].getAsyncData();
                }
            }
        );
        this._appendSignal(signal, this._instances[id], true);

        signal = this._instances[id].connect(
            "change-occurred",
            () => {
                let timerId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    this._brightnessDuration * 1000 + 100,
                    () => {
                        /**
                         * we need to delay this check because
                         * the transition takes 'duration' seconds
                         **/
                        this._checkInstance(id);

                        this._timers = Utils.removeFromArray(this._timers, timerId);
                    }
                );
                this._timers.push(timerId);
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

            this._instances[id].setConnectionTimeout(this._connectionTimeout);
            this._connectDeviceInstance(id);
        }

        this._instances[id].update(this.devices[id]);
    }

    checkInstances() {
        for (let id in this._instances) {
            this._instances[id].getDeviceAllEffects();

            /* this will invoke this.refreshMenu via "info-data" */
            this._checkInstance(id);
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
            Utils.logError(`Failed to get gnome icon: ${iconName}`);
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
            Utils.logError(`Failed to get icon: ${iconPath}`);
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
            this._("Refresh menu")
        );

        if (this._iconPack !== NanoIconPack.NONE) {
            icon = this._getGnomeIcon("emblem-synchronizing-symbolic");

            if (icon !== null){
                refreshMenuItem.insert_child_at_index(icon, 1);
            }
        }

        signal = refreshMenuItem.connect(
            'activate',
            () => {
                this._instances = {};
                rebuildFunction();
            }
        );
        this._appendSignal(signal, refreshMenuItem, true, true);

        items.push(refreshMenuItem);

        /**
         * Settings menu item
         */
        let prefsMenuItem = new PopupMenu.PopupMenuItem(
            this._("Settings")
        );

        if (this._iconPack !== NanoIconPack.NONE) {
            icon = this._getGnomeIcon("emblem-system");

            if (icon !== null) {
                prefsMenuItem.insert_child_at_index(icon, 1);
            }
        }

        signal = prefsMenuItem.connect(
            'activate',
            () => { this._openPref(); }
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
    _createSettingItems() {
        let items = [];

        let settingsItems = this._createDefaultSettingsItems(
            this.rebuildMenuStart.bind(this)
        );
        for (let settingsItem of settingsItems) {
            items.push(settingsItem);
        }

        return items;
    }

    _createNanoServiceMenu() {
        let nanoSubMenu = new PopupMenu.PopupSubMenuMenuItem(
            this._("Nano Lights")
        );

        /* disable closing menu on item activated */
        nanoSubMenu.menu.itemActivated = (animate) => {};

        nanoSubMenu.menu.connect(
            'open-state-changed',
            (menu, isOpen) => {
                this._handleLastOpenedMenu(menu, isOpen);
            }
        );

        if (this._iconPack !== NanoIconPack.NONE) {
            let icon = this._getIconByPath(this._mainDir.get_path() + '/media/leaf-lights.svg');

            if (icon !== null){
                nanoSubMenu.insert_child_at_index(icon, 1);
            }
        }

        for (let item of this._createSettingItems()) {
            nanoSubMenu.menu.addMenuItem(item);
        }

        return [nanoSubMenu];
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
     * @param {String} id
     * @param {Boolean} tmp: true for permanent refresh object
     */
     _createSwitchColor(switchItem, data, id, permanent = true) {

        let path = `${this._rndID()}::device::${id}::color`;

        this.refreshMenuObjects[path] = {
            "id": id,
            "object":switchItem,
            "type": NanoRefreshItems.SWITCH_COLOR,
            "permanent": permanent
        }
    }

    /**
     * Colorizes slideres based on light color.
     * 
     * @method _createLightSwitch
     * @private
     * @param {Object} slider to colorize
     * @param {String} id
     * @param {Boolean} tmp: true for permanent refresh object
     */
    _createSliderColor(slider, data, id, permanent = true) {

        let path = `${this._rndID()}::device::${id}::color`;

        this.refreshMenuObjects[path] = {
            "id": id,
            "object":slider,
            "type": NanoRefreshItems.SLIDER_COLOR,
            "permanent": permanent
        }
    }

    _getEffectColor(data, name) {
        if (data["animations"] === undefined) {
            return [0, 0, 0];
        }

        for (let i in data["animations"]) {
            let effect = data["animations"][i];

            if (effect["animName"] === name) {
                let counter = 0;
                let [r, g, b ] = [0, 0, 0];

                for (let color in effect["palette"]) {

                    let [subR, subG, subB] = Utils.hsvToRgb(
                        effect["palette"][color]["hue"],
                        effect["palette"][color]["saturation"],
                        100
                        //effect["palette"][color]["brightness"]
                    )

                    if (subR > 0 || subG > 0 || subB > 0) {
                        r = r + subR;
                        g = g + subG;
                        b = b + subB;
                        counter++;
                    }
                }

                return [
                    Math.round(r / counter),
                    Math.round(g / counter),
                    Math.round(b / counter)
                ];
            }
        }

        return [0, 0, 0];
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

            return [
                Math.round(r / counter),
                Math.round(g / counter),
                Math.round(b / counter)
            ];
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

        if (data[id]["state"]["colorMode"]=== undefined) {
            return [0, 0, 0];
        }

        let color = [0, 0, 0];

        switch (data[id]["state"]["colorMode"]) {
            case "hs":
                color = Utils.hsvToRgb(
                    data[id]["state"]["hue"]["value"],
                    data[id]["state"]["sat"]["value"],
                    100
                    //data[id]["state"]["brightness"]["value"]
                )
                break;

            case "ct":
                let kelvin = data[id]["state"]["ct"]["value"];
                color = Utils.kelvinToRGB(kelvin);
                break;

            case "effect":
                if (this._allEffects[id] === undefined) {
                    color = [0, 0, 0];
                    break;
                }

                color = this._getEffectColor(
                    this._allEffects[id],
                    data[id]["effects"]["select"]
                );
                break;

            default:
                color = [0, 0, 0];
                break;
        }

        return [
            Math.round(color[0]),
            Math.round(color[1]),
            Math.round(color[2])
        ];
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

    _getAnyDeviceOn(data) {
        for (let subId in data) {
            if (this._getDeviceOn(data, subId)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Creates slider for controlling the brightness
     * 
     * @method _createBrightnessSlider
     * @private
     * @param {String} id
     * @return {Object} Brightness slider
     */
     _createDeviceSlider(data, id, permanent = true) {

        let path = "";
        let themeContext = St.ThemeContext.get_for_stage(global.stage);

        let slider = new Slider.Slider(0);
        slider.set_width(180 * themeContext.scaleFactor);
        slider.set_height(25);
        slider.set_x_align(Clutter.ActorAlign.START);
        slider.set_x_expand(false);
        slider.value = 0;

        this._createSliderColor(slider, data, id, permanent);

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
            "type": NanoRefreshItems.SLIDER_BRIGHTNESS,
            "permanent": permanent
        }

        return slider;
    }

    _createDeviceSwitch(data, id, permanent = true) {
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
            "type": NanoRefreshItems.SWITCH_VALUE,
            "permanent": permanent
        }

        this._createSwitchColor(switchBox, data, id, permanent);

        return switchButton;
    }

    _createNanoDevice(data, id = "all") {
        let item;
        let name = this._("All")

        if (id !== "all") {
            name = this._instances[id].name;
        }

        item = new PopupMenu.PopupMenuItem(name);

        let label = item.label
        item.remove_child(item.label);
        let itemBox = new St.BoxLayout();
        itemBox.vertical = true;
        itemBox.add(label);

        itemBox.add(this._createDeviceSlider(data, id));

        item.insert_child_at_index(itemBox, 1);

        if (this._iconPack !== NanoIconPack.NONE) {
            let icon = this._getGnomeIcon("dialog-information");

            if (icon !== null) {
                item.insert_child_at_index(icon, 1);
            }
        }
        
        item.set_x_align(Clutter.ActorAlign.FILL);
        item.label.set_x_expand(true);

        item.add(this._createDeviceSwitch(data, id));

        item.originalActivate = item.activate;
        item.activate = (event) => {
            if (id !== "all" && !this._instances[id].isConnected()) {
                return item.originalActivate(event);
            }

            if (this._menuSelected["nano"] !== undefined &&
                this._menuSelected["nano"]["device"] === id) {

                return item.originalActivate(event);
            }

            this._selectNanoMenu(data, id);

            return item.originalActivate(event);
        }

        this._nanoMenu["devices"]["menu-items"][id] = item;

        return [item];
    }

    _createNanoMenuDevices(data) {
        let items = [];

        let deviceSubMenu = new PopupMenu.PopupSubMenuMenuItem(
            this._("No device selected")
        );

        /* disable closing menu on item activated */
        deviceSubMenu.menu.itemActivated = (animate) => {};

        let label = deviceSubMenu.label
        deviceSubMenu.remove_child(deviceSubMenu.label);
        let itemBox = new St.BoxLayout();
        itemBox.vertical = true;
        itemBox.add(label);
        deviceSubMenu.insert_child_at_index(itemBox, 1);

        if (this._iconPack !== NanoIconPack.NONE) {
            let icon = this._getGnomeIcon("dialog-information");

            if (icon !== null) {
                deviceSubMenu.insert_child_at_index(icon, 1);
            }
        }

        this._nanoMenu["devices"] = {}
        this._nanoMenu["devices"]["object"] = deviceSubMenu;
        this._nanoMenu["devices"]["icon"] = null;
        this._nanoMenu["devices"]["box"] = itemBox; 
        this._nanoMenu["devices"]["switch"] = null;
        this._nanoMenu["devices"]["slider"] = null;
        this._nanoMenu["devices"]["unselect-button"] = null;
        this._nanoMenu["devices"]["selected"] = null;
        this._nanoMenu["devices"]["menu-items"] = {};

        this._openMenuDefault = deviceSubMenu.menu;

        deviceSubMenu.connect(
            'activate',
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

        return [deviceSubMenu];
    }

    _createNanoMenuControl(data) {
        let controlSubMenu = new PopupMenu.PopupSubMenuMenuItem(
            this._("Select a device")
        );
        
        /* disable closing menu on item activated */
        controlSubMenu.menu.itemActivated = (animate) => {};

        if (this._iconPack !== NanoIconPack.NONE) {
            let icon = this._getGnomeIcon("applications-graphics");

            if (icon !== null) {
                controlSubMenu.insert_child_at_index(icon, 1);
            }
        }

        this._nanoMenu["control"] = {}
        this._nanoMenu["control"]["object"] = controlSubMenu;
        this._nanoMenu["control"]["icon"] = null;
        this._nanoMenu["control"]["box"] = null; 
        this._nanoMenu["control"]["switch"] = null;
        this._nanoMenu["control"]["slider"] = null;
        this._nanoMenu["control"]["unselect-button"] = null;
        this._nanoMenu["control"]["selected"] = null;

        controlSubMenu.menu.connect(
            'open-state-changed',
            (menu, isOpen) => {
                if (!isOpen &&
                    this._menuSelected["nano"] !== undefined &&
                    this._menuSelected["nano"]["device"] !== "all") {

                    this._openMenuDefault = controlSubMenu.menu;
                }

                this._handleLastOpenedMenu(menu, isOpen);
            }
        );

        controlSubMenu.visible = false;

        return [controlSubMenu];
    }

    _createNanoMenuEffects(data) {
        let effectsSubMenu = new PopupMenu.PopupSubMenuMenuItem(
            this._("Select a device")
        );

        /* disable closing menu on item activated */
        effectsSubMenu.menu.itemActivated = (animate) => {};

        if (this._iconPack !== NanoIconPack.NONE) {
            let icon = this._getGnomeIcon("preferences-desktop-theme");

            if (icon !== null) {
                effectsSubMenu.insert_child_at_index(icon, 1);
            }
        }

        this._nanoMenu["effects"] = {}
        this._nanoMenu["effects"]["object"] = effectsSubMenu;
        this._nanoMenu["effects"]["icon"] = null;
        this._nanoMenu["effects"]["box"] = null; 
        this._nanoMenu["effects"]["switch"] = null;
        this._nanoMenu["effects"]["slider"] = null;
        this._nanoMenu["effects"]["unselect-button"] = null;
        this._nanoMenu["effects"]["selected"] = null;

        effectsSubMenu.menu.connect(
            'open-state-changed',
            (menu, isOpen) => {
                if (!isOpen &&
                    this._menuSelected["nano"] !== undefined &&
                    this._menuSelected["nano"]["device"] !== "all") {

                    this._openMenuDefault = effectsSubMenu.menu;
                }
                this._handleLastOpenedMenu(menu, isOpen);
            }
        );

        effectsSubMenu.visible = false;

        return [effectsSubMenu];
    }

    _createNanoMenu() {
        let items = [];

        if (Object.keys(this._infoData).length === 0) {
            return items;
        }

        items = items.concat(
            this._createNanoMenuDevices(this._infoData)
        );

        items = items.concat(
            this._createNanoMenuControl(this._infoData)
        );

        items = items.concat(
            this._createNanoMenuEffects(this._infoData)
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
            let timerId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                100,
                () => {
                    if (this._lastOpenedMenu["opening"] !== null) {
                        this._lastOpenedMenu["opening"].open(true);
                        this._lastOpenedMenu["opening"] = null;
                    }

                    this._timers = Utils.removeFromArray(this._timers, timerId);
                }
            );
            this._timers.push(timerId);
        }

        if (!isOpen) {
            this._lastOpenedMenu["last"] = menu;
        }
    }

    _updateUnselectDeviceButton(data, id) {
        if (this._nanoMenu["devices"]["unselect-button"] !== null){
            this._nanoMenu["devices"]["object"].remove_child(
                this._nanoMenu["devices"]["unselect-button"]
            );

            this._nanoMenu["devices"]["unselect-button"] = null;
        }

        let unselectButton = new St.Button(
            {reactive: true, can_focus: true}
        );

        if (id == "all") {
            this._nanoMenu["devices"]["unselect-button"] = unselectButton;
            return unselectButton;
        }

        let buttonContent = null;
        if (this._iconPack !== NanoIconPack.NONE) {
            buttonContent = this._getGnomeIcon("edit-undo");
        }

        if (buttonContent === null) {
            buttonContent = new St.Label();
            buttonContent.text = "<<<";
        }

        buttonContent.set_y_align(Clutter.ActorAlign.CENTER);
        buttonContent.set_y_expand(true);

        unselectButton.child = buttonContent;

        unselectButton.connect(
            "button-press-event",
            () => {
                this._selectNanoMenu(data, "all");
            }
        );

        this._nanoMenu["devices"]["unselect-button"] = unselectButton;

        return unselectButton;
    }

    _selectNanoDevice(data, id) {
        /**
         * remove old selection
         */
        if (this._nanoMenu["devices"]["icon"] !== null) {
            this._nanoMenu["devices"]["object"].remove_child(
                this._nanoMenu["devices"]["icon"]
            );

            this._nanoMenu["devices"]["icon"] = null;
        }

        if (this._nanoMenu["devices"]["switch"] !== null) {
            this._nanoMenu["devices"]["object"].remove_child(
                this._nanoMenu["devices"]["switch"]
            );

            this._nanoMenu["devices"]["switch"] = null;
        }

        if (this._nanoMenu["devices"]["slider"] !== null) {
            this._nanoMenu["devices"]["box"].remove_child(
                this._nanoMenu["devices"]["slider"]
            );

            this._nanoMenu["devices"]["slider"] = null;
        }

        /**
         * create unselect button
         */
        this._nanoMenu["devices"]["object"].insert_child_at_index(
            this._updateUnselectDeviceButton(data, id),
            this._nanoMenu["devices"]["object"].get_children().length - 1
        );

        /**
         * set current selection
         */
        let name = this._("All")

        if (id !== "all") {
            name = this._instances[id].name;
        }
        this._nanoMenu["devices"]["object"].label.text = name;

        let slider = this._createDeviceSlider(data, id, false);
        this._nanoMenu["devices"]["box"].insert_child_at_index(slider, 1);
        this._nanoMenu["devices"]["slider"] = slider;

        let itemSwitch = this._createDeviceSwitch(data, id, false);
        this._nanoMenu["devices"]["object"].insert_child_at_index(
            itemSwitch,
            this._nanoMenu["devices"]["object"].get_children().length - 1
        );
        this._nanoMenu["devices"]["switch"] = itemSwitch;


        this.refreshMenu();
    }

    _selectNanoMenu(data, id) {
        if (this._nanoMenu["devices"]["menu-items"][id] === undefined) {
            Utils.logDebug("Can not select menu. Unknown menu id.");
            return;
        }

        if(Object.keys(data).length === 0) {
            Utils.logDebug(`Can not select device. No data available.`);
            return;
        }

        /**
         * remove old refreshing links
         */
        for (let path in this.refreshMenuObjects) {
            if (!this.refreshMenuObjects[path]["permanent"]) {
                delete this.refreshMenuObjects[path];
            }
        }

        this._menuSelected["nano"] = {"device": id};
        this.writeMenuSelectedSettings();

        let item = this._nanoMenu["devices"]["menu-items"][id];

        this._selectNanoDevice(data, id);
        this._selectNanoControl(data, id);
        this._selectNanoEffects(data, id);

        if (this._nanoMenu["devices"]["hidden-item"] !== undefined) {
            this._nanoMenu["devices"]["hidden-item"].visible = true;
        }

        item.visible = false;
        this._nanoMenu["devices"]["hidden-item"] = item;

        if (id === "all") {

            this._openMenuDefault = this._nanoMenu["devices"]["object"].menu;
            this._nanoMenu["devices"]["object"].menu.open(true);

        } else if (this._nanoMenu["effects"]["object"].visible) {

            this._openMenuDefault = this._nanoMenu["effects"]["object"].menu;
            this._nanoMenu["effects"]["object"].menu.open(true);

        } else if (this._nanoMenu["control"]["object"].visible) {

            this._openMenuDefault = this._nanoMenu["control"]["object"].menu;
            this._nanoMenu["control"]["object"].menu.open(true);

        }
    }

    checkEffectIconExist(type) {
        switch (type) {
            case "rhythm": 
                return this._getGnomeIcon("audio-x-generic");
            default:
                break;
        }

        return null;
    }

    trytoGetIconOfEffect(id, effectName) {
        if (id === "all") {
            for (let i in this._allEffects) {
                if (this._allEffects[i]["animations"] === undefined) {
                    continue;
                }

                for (let effect of this._allEffects[i]["animations"]) {
                    if (effect["animName"] === effectName) {
                        let icon = this.checkEffectIconExist(effect["pluginType"]);
                        if (icon) {
                            return icon;
                        }
                    }
                }
            }

            return null;
        }

        if (this._allEffects[id] === undefined ||
            this._allEffects[id]["animations"] === undefined) {

            return null;
        }

        for (let effect of this._allEffects[id]["animations"]) {
            if (effect["animName"] === effectName) {
                let icon = this.checkEffectIconExist(effect["pluginType"]);
                if (icon) {
                    return icon;
                }
            }
        }

        return null;
    }

    _createNanoEffectsItems(effectsArray, id) {
        let res = [];

        for (let effect of effectsArray) {
            let effectItem = new PopupMenu.PopupMenuItem(
                effect
            );

            effectItem.x_align = Clutter.ActorAlign.FILL;
            effectItem.x_expand = true;
            effectItem.label.x_align = Clutter.ActorAlign.CENTER;
            effectItem.label.set_x_expand(true);

            if (this._iconPack !== NanoIconPack.NONE) {
                let icon = this.trytoGetIconOfEffect(id, effect);
    
                if (icon !== null){
                    effectItem.insert_child_at_index(icon, 1);
                }
            }

            let path = `${this._rndID()}::device::${id}::switch`;

            effectItem.connect(
                "activate",
                this._menuEventHandler.bind(
                    this,
                    {
                        "path": path,
                        "id": id,
                        "object":effect,
                        "type": NanoEvents.EFFECT
                    }
                )
            );

            res.push(effectItem);
        }

        return res;
    }

    _createNanoControl(data, id) {
        let path = "";
        let controlItem = new PopupMenu.PopupMenuItem("");
        controlItem.x_align = Clutter.ActorAlign.CENTER;
        controlItem.remove_child(controlItem.label);

        let colorPickerBox = new ColorPicker.ColorPickerBox(this._mainDir, {
            useColorWheel: true,
            useWhiteBox: true
        });

        controlItem.add(colorPickerBox.createColorBox());

        path = `${this._rndID()}::device::${id}::color`;
        colorPickerBox.connect(
            "color-picked",
                this._menuEventHandler.bind(
                    this,
                    {
                        "path": path,
                        "id": id,
                        "object":colorPickerBox,
                        "type": NanoEvents.COLOR_PICKER
                    }
                )
        );

        return [controlItem];
    }

    _createNanoEffects(data, id) {
        if (id === "all") {
            let effects = [];
            for (let i in data) {
                if (data[i]["effects"] === undefined) {
                    continue;
                }

                if (effects.length === 0) {
                    for (let j of data[i]["effects"]["effectsList"]) {
                        effects.push(j);
                    }

                    continue;
                }

                effects = effects.filter(
                    value => data[i]["effects"]["effectsList"].includes(value)
                );
            }

            return this._createNanoEffectsItems(effects, id);
        }

        if (data[id] === undefined) {
            return [];
        }

        if (data[id]["effects"] === undefined) {
            return [];
        }

        return this._createNanoEffectsItems(data[id]["effects"]["effectsList"], id);
    }

    _selectNanoControl(data, id) {

        this._nanoMenu["control"]["object"].visible = false;
        this._nanoMenu["control"]["object"].menu.removeAll();
        this._nanoMenu["control"]["object"].label.text = this._("Color & Temperature")

        let controlItems = this._createNanoControl(data, id);
        for (let item in controlItems) {
            this._nanoMenu["control"]["object"].menu.addMenuItem(controlItems[item]);
        }

        if (controlItems.length === 0) {
            this._nanoMenu["control"]["object"].visible = false;
        } else {
            this._nanoMenu["control"]["object"].visible = true;
        }
    }

    _selectNanoEffects(data, id) {

        this._nanoMenu["effects"]["object"].visible = false;
        this._nanoMenu["effects"]["object"].menu.removeAll();
        this._nanoMenu["effects"]["object"].label.text = this._("Scenes");

        let effectsItems = this._createNanoEffects(data, id);
        for (let item in effectsItems) {
            this._nanoMenu["effects"]["object"].menu.addMenuItem(effectsItems[item]);
        }

        if (effectsItems.length === 0) {
            this._nanoMenu["effects"]["object"].visible = false;
        } else {
            this._nanoMenu["effects"]["object"].visible = true;
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
        this._infoData = {};
        this._nanoMenu = {}

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
         * In case of not getting any response from some device
         * within the time
         * this will build menu for devices that responded so far
         */
        let timeout = (this._connectionTimeout + 1) * 1000;
        let timerId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            timeout,
            () => {
                if (this._rebuildingMenu) {
                    Utils.logDebug("Not all devices responded. Rebuilding menu anyway.");

                    this._rebuildingMenu = false;
                    this._rebuildingMenuRes = {};

                    this._rebuildMenu();

                    this._timers = Utils.removeFromArray(this._timers, timerId);
                }
            }
        );
        this._timers.push(timerId);
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

        if (nanoMenu.length > 0) {
            for (let item of this._createNanoServiceMenu()) {
                this.menu.addMenuItem(item);
            }
            this.menu.addMenuItem(
                new PopupMenu.PopupSeparatorMenuItem()
            );
        }

        for (let item in nanoMenu) {
            this.menu.addMenuItem(nanoMenu[item]);
        }

        if (nanoMenu.length === 0) {
            for (let item of this._createSettingItems()) {
                this.menu.addMenuItem(item);
            }
        }

        if (this._menuSelected["nano"] !== undefined &&
            this._menuSelected["nano"]["device"] !== undefined &&
            this._infoData[this._menuSelected["nano"]["device"]] !== undefined) {

            this._selectNanoMenu(
                this._infoData,
                this._menuSelected["nano"]["device"]
            );
        } else {
            this._selectNanoMenu(this._infoData, "all");
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
            let onlyOn = this._getAnyDeviceOn(this._infoData)

            for (let subId in this._instances) {
                if (onlyOn && !this._getDeviceOn(this._infoData, subId)) {
                    continue
                }

                data["id"] = subId;
                this._menuEventHandler(data);
                data["id"] = "all"; /* will be preserved for next call, we need to return 'all' */
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

                this._instances[id].setDeviceBrightness(
                    value,
                    this._brightnessDuration
                );

                break;

            case NanoEvents.COLOR_PICKER:

                if (object.colorTemperature > 0) {
                    value = object.colorTemperature;
                    this._instances[id].setDeviceTemperature(parseInt(value));
                    break;
                }

                let [h, s, l] = Utils.rgbToHsv(object.r, object.g, object.b);

                this._instances[id].setDeviceColor(h, s);

                break;

            case NanoEvents.EFFECT:
                this._instances[id].setDeviceEffect(object);
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

    /**
     * Check and change indicator position in menu.
     * 
     * @method setPositionInPanel
     */
    setPositionInPanel() {

        let children = null;

        if (this._indicatorPositionBackUp === this._indicatorPosition) {
            return;
        }

        this.get_parent().remove_actor(this);

        switch (this._indicatorPosition) {

            case NanoMenuPosition.LEFT:

                children = Main.panel._leftBox.get_children();
                Main.panel._leftBox.insert_child_at_index(
                    this,
                    children.length
                );
                break;

            case NanoMenuPosition.CENTER:

                children = Main.panel._centerBox.get_children();
                Main.panel._centerBox.insert_child_at_index(
                    this,
                    children.length
                    );
                break;

            case NanoMenuPosition.RIGHT:

                children = Main.panel._rightBox.get_children();
                Main.panel._rightBox.insert_child_at_index(this, 0);
                break;

            default:
                children = Main.panel._rightBox.get_children();
                Main.panel._rightBox.insert_child_at_index(this, 0);
        }

        this._indicatorPositionBackUp = this._indicatorPosition;
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

        Utils.logDebug("Refreshing nano menu.");

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

                    if (value[0] === 0 &&
                        value[1] === 0 &&
                        value[2] === 0) {

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

                    if (value[0] === 0 &&
                        value[1] === 0 &&
                        value[2] === 0) {

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
     * Remove timers created by GLib.timeout_add
     * 
     * @method disarmTimers
     */
    disarmTimers() {
        for (let t of this._timers) {
            if (t) {
                GLib.Source.remove(t);
            }
        }

        this._timers = [];
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