// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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

const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const { dbusPromiseify } = imports.common.util;

const App = GObject.registerClass({
    Properties: {
        unique_id: GObject.ParamSpec.string('unique-id', '','', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, null),
        icon: GObject.ParamSpec.string('icon', '','', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, null),
        name: GObject.ParamSpec.string('name', '','', GObject.ParamFlags.READWRITE, null),
        description: GObject.ParamSpec.string('description', '','', GObject.ParamFlags.READWRITE, null),
        error: GObject.ParamSpec.string('error', '','', GObject.ParamFlags.READWRITE, null),
    }
}, class AlmondApp extends GObject.Object {});

/* exported AppModel */
var AppModel = class AppModel {
    constructor(window, service, listbox) {
        this._service = service;
        this._listbox = listbox;

        this._apps = new Map;
        this._store = new Gio.ListStore();
        listbox.bind_model(this._store, (device) => {
            return this._makeAppWidget(device);
        });
    }

    start() {
        this._appAddedId = this._service.connectSignal('AppAdded', (signal, sender, [app]) => {
            this._onAppAdded(app);
        });
        this._appRemovedId = this._service.connectSignal('AppRemoved', (signal, sender, [id]) => {
            this._onAppRemoved(id);
        });

        return dbusPromiseify(this._service, 'GetAppInfosRemote').then(([apps]) => {
            for (let app of apps)
                this._onAppAdded(app);
        }).catch((e) => {
            log('Failed to retrieve the list of running apps: ' + e);
        });
    }

    stop() {
        this._service.disconnectSignal(this._appAddedId);
        this._service.disconnectSignal(this._appRemovedId);
    }

    _onAppAdded(appInfo) {
        let app = new App({
            unique_id: appInfo.uniqueId.deep_unpack(),
            icon: appInfo.icon.deep_unpack(),
            name: appInfo.name.deep_unpack(),
            description: appInfo.description.deep_unpack(),
        });

        this._apps.set(app.unique_id, app);
        this._store.append(app);
    }

    _onAppRemoved(uniqueId) {
        this._apps.delete(uniqueId);

        let n = this._store.get_n_items();
        for (let i = 0; i < n; i++) {
            let app = this._store.get_item(i);
            if (app.unique_id === uniqueId) {
                this._store.remove(i);
                break;
            }
        }
    }

    _makeAppWidget(app) {
        let box = new Gtk.Grid({
            column_spacing: 4,
            row_spacing: 4,
            margin: 12
        });
        box.get_style_context().add_class('device');

        let icon = new Gtk.Image({
            pixel_size: 64,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER
        });
        window.getApp().cache.cacheIcon(app.icon).then((gicon) => icon.gicon = gicon).catch(logError);
        box.attach(icon, 0 /*left*/, 0 /*top*/, 1 /*width*/, 2 /*height*/);

        let name = new Gtk.Label({
            hexpand: true,
            halign: Gtk.Align.START,
            xalign: 0
        });
        name.get_style_context().add_class('app-name');
        app.bind_property('name', name, 'label', GObject.BindingFlags.SYNC_CREATE);
        box.attach(name, 1 /*left*/, 0 /*top*/, 1 /*width*/, 1 /*height*/);

        let description = new Gtk.Label({
            hexpand: true,
            wrap: true,
            halign: Gtk.Align.START,
            xalign: 0,
            justify: Gtk.Justification.FILL
        });
        app.bind_property('description', description, 'label', GObject.BindingFlags.SYNC_CREATE);
        box.attach(description, 1 /*left*/, 1 /*top*/, 1 /*width*/, 1 /*height*/);

        let del = Gtk.Button.new_from_icon_name('user-trash-symbolic', Gtk.IconSize.BUTTON);
        del.valign = Gtk.Align.CENTER;
        del.halign = Gtk.Align.CENTER;
        del.connect('clicked', () => {
            this._service.DeleteAppRemote(app.unique_id, (result, error) => {
                if (error)
                    log('Failed to delete ' + app.unique_id + ': ' + error);
            });
        });
        box.attach(del, 2 /*left*/, 0 /*top*/, 1 /*width*/, 2 /*height*/);

        icon.show();
        name.show();
        description.show();
        del.show();
        box.show();

        return box;
    }
};
