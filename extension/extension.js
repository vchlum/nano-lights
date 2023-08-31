'use strict';

/**
 * extension nano-lights
 * JavaScript Gnome extension for Nanoleaf devices.
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

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as NanoMenu from './nanomenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class NanoLightsExtension extends Extension {
    enable() {
        this._nanoLightsMenu = new NanoMenu.NanoPanelMenu(
            this.metadata.name,
            this.dir,
            this.getSettings(),
            this.openPreferences.bind(this)
        );

        Main.panel.addToStatusArea('nano-lights', this._nanoLightsMenu);
    }

    disable() {
        this._nanoLightsMenu.disarmTimers();
        this._nanoLightsMenu.disconnectSignals(true);
        this._nanoLightsMenu.destroy();
        this._nanoLightsMenu = null;
    }
}
