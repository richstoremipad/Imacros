/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/


// An object to encapsulate all recording operations
// on extension side
function Recorder(windowId) {
    this.windowId = windowId;
    this.recording = false;
    communicator.registerHandler("record-action",
                                 this.onRecordAction.bind(this), windowId);
    communicator.registerHandler("query-state",
                                 this.onQueryState.bind(this), windowId);
};


Recorder.prototype.start = function() {
    console.info("start recording");
    context.updateState(this.windowId,"recording");
    // create array to store recorded actions
    this.actions = new Array();
    var recorder = this;
    chrome.tabs.getSelected(this.windowId, function (tab) {
        recorder.recording = true;
        // save starting tab index
        recorder.startTabIndex = tab.index;
        // add browser events listeners
        recorder.addListeners();
        // notify content script that recording was started
        communicator.broadcastMessage(
            "start-recording",
            { frameNumber: (recorder.currentFrameNumber = 0) },
            recorder.windowId
        );
        // save intial commands
        recorder.recordAction(version_string);
        var cmd = "URL GOTO="+tab.url;
        recorder.recordAction(cmd);
    });
};


Recorder.prototype.stop = function() {
    console.info("stop recording");
    // notify content script that recording was stopped
    communicator.broadcastMessage("stop-recording", {}, this.windowId);
    context.updateState(this.windowId,"idle");
    
    this.recording = false;
    this.removeListeners();
    // remove text from badge
    chrome.browserAction.setBadgeText({text: ""});
};


Recorder.prototype.recordAction = function (cmd) {
    this.actions.push(cmd);
    chrome.browserAction.setBadgeBackgroundColor(
        {color: [255,100,100,200]}
    );
    chrome.browserAction.setBadgeText(
        {text: this.actions.length.toString()}
    );
    console.info("recorded action: "+cmd);
};

Recorder.prototype.onRecordAction = function(data) {
    var cmd = data.action;
    // test action for password element
    var m, pwd_re = "\\btype=input:password\\b.+content=(\\S+)\\s*$";
    pwd_re = new RegExp(pwd_re, "i");
    if (m = pwd_re.exec(cmd)) { // handle password
        var plaintext = m[1], cyphertext;
        var typ = Storage.getChar("encryption-type");
        if (!typ.length)
            typ = "no";
        switch(typ) {
        case "no":
            this.recordAction("SET !ENCRYPTION NO");
            this.recordAction(cmd);
            break;
        case "stored":      // get password from storage
            this.recordAction("SET !ENCRYPTION NO");
            var pwd = Storage.getChar("stored-password");
            // stored password is base64 encoded
            pwd = decodeURIComponent(atob(pwd));
            cyphertext = Rijndael.encryptString(plaintext, pwd);
            cmd = cmd.replace(/(content)=(\S+)\s+$/i, "$1="+cyphertext);
            this.recordAction(cmd);
            break;
        case "tmpkey":
            this.recordAction("SET !ENCRYPTION TMPKEY");
            if (!Rijndael.tempPassword) {    // ask password now
                var features = "titlebar=no,menubar=no,location=no,"+
                    "resizable=yes,scrollbars=yes,status=no,"+
                    "width=350,height=170";
                var win = window.open("passwordDialog.html",
                    null, features);
                win.args = {
                    shouldProceed: true,
                    type: "recorder",
                    actionIndex: this.actions.length,
                    plaintext: plaintext,
                    cmd: cmd,
                    recorder: this
                };
                // action will we added in passwordDialog
                return;
            } else {
                cyphertext = Rijndael.encryptString(
                    plaintext,
                    Rijndael.tempPassword
                );
                cmd = cmd.replace(/(content)=(\S+)\s*$/i, "$1="+cyphertext);
                this.recordAction(cmd);
            }
            break;
        }
    } else {
        this.recordAction(cmd);
    }
};


Recorder.prototype.onQueryState = function(data, tab_id) {
    var recorder = this;
    chrome.tabs.get(tab_id, function (tab) {
        if (tab.windowId != recorder.windowId)
            return;
        if (tab.index < recorder.startTabIndex) {
            // don't touch tabs left of start tab
            communicator.postMessage("current-state", {state: "idle"}, tab_id);
        } else {
            if (recorder.recording) {
                communicator.postMessage(
                    "current-state", {
                        state: "recording",
                        frameNumber: recorder.currentFrameNumber
                    }, tab_id);
            } else {
                communicator.postMessage("current-state",
                                         {state: "idle"}, tab_id);
            }
        }
    });
};


// Add listeners for recording events
// tab selection 
Recorder.prototype.onTabSelectionChanged = function(tab_id, obj) {
    if (this.windowId != obj.windowId)
        return;
    var recorder = this;
    chrome.tabs.get(tab_id, function (tab) {
        var cur = tab.index - recorder.startTabIndex;
        if (cur < 0) {
            // TODO: add real warning here
            console.warn("Note: Tabs LEFT "+
                         "of the start tab are not recorded.");
            return;
        }
        var cmd = "TAB T="+(cur+1);
        recorder.recordAction(cmd);
        console.info("recorded action: "+cmd);
    });
    
};

// tab creation
Recorder.prototype.onTabCreated = function(tab) {
    if (this.windowId != obj.windowId)
        return;
    var cmd = "TAB OPEN";
    this.recordAction(cmd);
};

// tab update
Recorder.prototype.onTabUpdated = function(tab_id, obj) {
    if (this.windowId != obj.windowId)
        return;
    chrome.tabs.get(tab_id, function (tab) {
            // TODO: wait for they added 'type' property
            // if (obj.status == "loading" && obj.url) {
            //     var cmd = "URL GOTO="+obj.url;
            //     recorder.recordAction(cmd);
            //     console.info("recorded action: "+cmd);
            // }
    });
};


// tab closed
Recorder.prototype.onTabRemoved = function(tab_id) {
    if (this.windowId != obj.windowId)
        return;
    var recorder = this;
    chrome.tabs.get(tab_id, function (tab) {
        var cmd = "TAB CLOSE";
        recorder.recordAction(cmd);
    });
};


// tab move, give a warning
Recorder.prototype.onTabMoved = function(tab_id, obj) {
    if (this.windowId != obj.windowId)
        return;
    // TODO: add real warning
    console.warn("tab move not supported");
};

// tab attached, give a warning
Recorder.prototype.onTabAttached = function(tab_id, obj) {
    if (this.windowId != obj.windowId)
        return;
    // TODO: add real warning
    console.warn("tab attachment not supported");
    
};

// tab detached, give a warning
Recorder.prototype.onTabDetached = function(tab_id, obj) {
    if (this.windowId != obj.oldWindowId)
        return;
    
    // TODO: add real warning
    console.warn("tab detachment not supported");
    
};


Recorder.prototype.addListeners = function() {
    // make bindings of event listeners
    this.onSelectionChanged = this.onTabSelectionChanged.bind(this);
    this.onCreated = this.onTabCreated.bind(this);
    this.onUpdated = this.onTabUpdated.bind(this);
    this.onRemoved = this.onTabRemoved.bind(this);
    this.onMoved = this.onTabMoved.bind(this);
    this.onAttached = this.onTabAttached.bind(this);
    this.onDetached = this.onTabDetached.bind(this);

    // add listeners
    chrome.tabs.onSelectionChanged.addListener(this.onSelectionChanged);
    chrome.tabs.onCreated.addListener(this.onCreated);
    chrome.tabs.onUpdated.addListener(this.onUpdated);
    chrome.tabs.onRemoved.addListener(this.onRemoved);
    chrome.tabs.onMoved.addListener(this.onMoved);
    chrome.tabs.onAttached.addListener(this.onAttached);
    chrome.tabs.onDetached.addListener(this.onDetached);
    
};

// remove recording listeners
Recorder.prototype.removeListeners = function() {
    chrome.tabs.onSelectionChanged.removeListener(this.onSelectionChanged);
    chrome.tabs.onCreated.removeListener(this.onCreated);
    chrome.tabs.onUpdated.removeListener(this.onUpdated);
    chrome.tabs.onRemoved.removeListener(this.onRemoved);
    chrome.tabs.onMoved.removeListener(this.onMoved);
    chrome.tabs.onAttached.removeListener(this.onAttached);
    chrome.tabs.onDetached.removeListener(this.onDetached);
};
