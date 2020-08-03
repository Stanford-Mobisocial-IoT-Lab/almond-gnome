// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
"use strict";

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;

const { dbusPromiseify } = imports.common.util;

const Device = GObject.registerClass({
    Properties: {
        unique_id: GObject.ParamSpec.string('unique-id', '','', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, null),
        kind: GObject.ParamSpec.string('kind', '','', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, null),
        name: GObject.ParamSpec.string('name', '','', GObject.ParamFlags.READWRITE, null),
        description: GObject.ParamSpec.string('description', '','', GObject.ParamFlags.READWRITE, null),
        device_class: GObject.ParamSpec.string('device-class', '','', GObject.ParamFlags.READWRITE, null),
        version: GObject.ParamSpec.int('version', '', '', GObject.ParamFlags.READWRITE, 0, GLib.MAXINT32, 0),
    }
},
class AlmondDevice extends GObject.Object {}
);

/* exported DeviceModel */
var DeviceModel = class DeviceModel {
    constructor(window, service, listbox) {
        this._service = service;
        this._listbox = listbox;

        this._devices = new Map;
        this._store = new Gio.ListStore();
        listbox.bind_model(this._store, (device) => {
            return this._makeDeviceWidget(device);
        });
    }

    start() {
        this._deviceAddedId = this._service.connectSignal('DeviceAdded', (signal, sender, [device]) => {
            this._onDeviceAdded(device);
        });
        this._deviceRemovedId = this._service.connectSignal('DeviceRemoved', (signal, sender, [id]) => {
            this._onDeviceRemoved(id);
        });

        return dbusPromiseify(this._service, 'GetDeviceInfosRemote').then(([devices]) => {
            for (let device of devices)
                this._onDeviceAdded(device);
        }).catch((e) => {
            log('Failed to retrieve the list of configured devices: ' + e);
        });
    }

    stop() {
        this._service.disconnectSignal(this._deviceAddedId);
        this._service.disconnectSignal(this._deviceRemovedId);
    }

    _onDeviceAdded(deviceInfo) {
        let device = new Device({
            unique_id: deviceInfo.uniqueId.deep_unpack(),
            kind: deviceInfo.kind.deep_unpack(),
            name: deviceInfo.name.deep_unpack(),
            description: deviceInfo.description.deep_unpack(),
            version: deviceInfo.version.deep_unpack(),
            device_class: deviceInfo.class.deep_unpack()
        });

        this._devices.set(device.unique_id, device);
        if (device.device_class === 'system')
            return;
        /*this._store.insert_sorted(device, (d1, d2) => {
            if (d1.name == d2.name)
                return 0;
            if (d1.name < d2.name)
                return -1;
            else
                return 1;
        });*/
        this._store.append(device);
    }

    _onDeviceRemoved(uniqueId) {
        this._devices.delete(uniqueId);

        let n = this._store.get_n_items();
        for (let i = 0; i < n; i++) {
            let dev = this._store.get_item(i);
            if (dev.unique_id === uniqueId) {
                this._store.remove(i);
                break;
            }
        }
    }

    _makeDeviceWidget(device) {
        let wrapper = new Gtk.EventBox({
            visible: true,
            visible_window: false
        });
        wrapper.add_events(Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.ENTER_NOTIFY_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK);
        wrapper.connect('enter-notify-event', () => {
            wrapper.set_state_flags(Gtk.StateFlags.PRELIGHT, false);
        });
        wrapper.connect('leave-notify-event', () => {
            wrapper.unset_state_flags(Gtk.StateFlags.PRELIGHT);
        });
        wrapper.get_style_context().add_class('device-compound-icon');
        let box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            visible: true
        });

        let icon = new Gtk.Image({
            pixel_size: 64,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
            visible: true
        });
        window.getApp().cache.cacheIcon(device.kind).then((gicon) => icon.gicon = gicon).catch(logError);
        box.pack_start(icon, false, false, 0);

        let label = new Gtk.Label({
            wrap: true,
            max_width_chars: 25,
            hexpand: true,
            justify: Gtk.Justification.CENTER,
            valign: Gtk.Align.START,
            visible: true
        });
        box.pack_start(label, true, true, 0);

        device.bind_property('name', label, 'label', GObject.BindingFlags.SYNC_CREATE);
        wrapper.add(box);

        let row = new Gtk.FlowBoxChild({ visible: true });
        row.add(wrapper);
        row._device = device;

        return row;
    }
};
