// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const events = require('events');

const SpeechRecognizer = require('./speech_recognizer');
const WakeWordDetector = require('./wake-word/porcupine');

module.exports = class SpeechHandler extends events.EventEmitter {
    constructor(platform) {
        super();
        this._platform = platform;
        this._pulse = platform.getCapability('pulseaudio');

        this._recognizer = new SpeechRecognizer({ locale: this._platform.locale });
        this._recognizer.on('error', (e) => {
            this.emit('error', e);
        });

        this._hotwordDetected = false;
        this._autoTrigger = false;
    }

    setAutoTrigger(autoTrigger) {
        console.log('setAutoTrigger', autoTrigger);
        this._autoTrigger = autoTrigger;
    }

    _onDetected() {
        let req = this._recognizer.request(this._stream);
        req.on('hypothesis', (hypothesis) => this.emit('hypothesis', hypothesis));
        req.on('done', (status, utterance) => {
            if (status === 'Success') {
                console.log('Recognized as "' + utterance + '"');
                this._detector.autoTrigger = false;
                this.emit('utterance', utterance);
            } else if (status === 'NoMatch') {
                this.emit('no-match');
            } else if (status === 'InitialSilenceTimeout') {
                this.emit('silence');
            } else {
                console.log('Recognition error: ' + status);
            }
        });
    }

    async start() {
        console.log('speech handler start');
        this._detector = new WakeWordDetector();
        await this._detector.init();
        console.log('Wake word detector initialized');

        if (this._detector.sampleRate !== 16000)
            console.error('WARNING: porcupine reports unexpected sample rate ' + this._detector.sampleRate + ', hoping for the best...');

        this._stream = this._pulse.createRecordStream({
            format: 'S16LE',
            rate: this._detector.sampleRate,
            channels: 1,
            properties: {
                'filter.want': 'echo-cancel',
            }
        });

        this._stream.on('state', (state) => {
            console.log('Record stream is now ' + state);
            if (state === 'ready')
                this.emit('ready');
        });
        this._stream.on('error', (e) => this.emit('error', e));

        this._detector.on('sound', () => {
            if (this._autoTrigger)
                this._onDetected();
        });
        this._detector.on('hotword', (hotword) => {
            console.log('Hotword ' + hotword + ' detected');
            this.emit('hotword', hotword);
            this._onDetected();
        });
        this._stream.pipe(this._detector);
    }

    stop() {
        if (!this._stream)
            return;
        this._stream.end();
        this._stream = null;
        this._recognizer.close();
        this._detector.destroy();
    }
};
