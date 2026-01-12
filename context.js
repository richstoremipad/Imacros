/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/

// Context to store browser window-specific information

var context = {
    init: function() {
        this.attachListeners();
        chrome.windows.getLastFocused(function (w) {
            context[w.id] = new Object();
            context[w.id].mplayer = new MacroPlayer(w.id);
            context[w.id].recorder = new Recorder(w.id);
            context[w.id].state = "idle";
        });
    },

    updateState: function(win_id, state) {
        // set browser action icon 
        switch(state) {
        case "playing": case "recording":
            chrome.browserAction.setIcon({path: "skin/stop.png"});
            break;
        case "paused":
            // TODO: switch to tab where replaying was paused
            // after unpause
            chrome.browserAction.setIcon({path: "skin/play.png"});
            break;
        case "idle":
            chrome.browserAction.setIcon({path: "skin/logo.gif"});
            break;
        }

        // update panel
        var panel = this[win_id].panelWindow;
        if (panel && !panel.closed)
            panel.updatePanel(state);
        this[win_id].state = state;
    },
    
    onCreated: function (w) {
        // context[w.id] = new Object();
        // context[w.id].mplayer = new MacroPlayer(w.id);
        // context[w.id].recorder = new Recorder(w.id);
    },

    onRemoved: function (id) {
        // if (context[id]) {
        //     var t;
        //     if (t = context[id].mplayer) {
        //         if (t.playing)
        //             t.stop();
        //         delete context[id].mplayer;
        //     }
        //     if (t = context[id].recorder) {
        //         if (t.recording)
        //             t.stop();
        //         delete context[id].recorder;
        //     }
        //     delete context[id];
        // } else {
        //     console.warn("no context for id="+id);
        // }
    },

    attachListeners: function() {
        // chrome.windows.onCreated.addListener(context.onCreated.bind(context));
        // chrome.windows.onRemoved.addListener(context.onRemoved.bind(context));
    }
};
