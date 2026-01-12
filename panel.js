/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/


// play-button click handler
function play() {
    if ($("play-button").getAttribute("disabled") == "true")
        return;
    try {
        var win_id = args.windowId;
        var bg = chrome.extension.getBackgroundPage();
        var mplayer = bg.context[win_id].mplayer;
        var doc = window.frames["tree-iframe"].document;
        var container = doc.getElementById("imacros-macro-container");
        var div = doc.getElementById("imacros-bookmark-div");
        var source = container.value;
        var name = div.getAttribute("name");
        if (mplayer.paused) {
            mplayer.unpause();
        } else {
            mplayer.play({name: name, source: source});
        }
    } catch (e) {
        console.error(e.toString());
    }
}

function playLoop() {
    var cur = parseInt($("current-loop").value);
    var max = parseInt($("max-loop").value);
    if (cur > max) {
        alert("Current loop value should be less or equivalent max loop value");
        return;
    }
    try {
        var win_id = args.windowId;
        var bg = chrome.extension.getBackgroundPage();
        var mplayer = bg.context[win_id].mplayer;
        var doc = window.frames["tree-iframe"].document;
        var container = doc.getElementById("imacros-macro-container");
        var div = doc.getElementById("imacros-bookmark-div");
        var source = container.value;
        var name = div.getAttribute("name");
        mplayer.play({name: name, source: source}, max, cur);
    } catch (e) {
        console.error(e.toString());
    }
}

// Pause button handler
function pause() {
    try {
        var win_id = args.windowId;
        var bg = chrome.extension.getBackgroundPage();
        var mplayer = bg.context[win_id].mplayer;
        if (mplayer.playing) {
            mplayer.pause();
        } 
    } catch (e) {
        console.error(e.toString());
    }
}

// Edit button handler
function edit() {
    if ($("edit-button").getAttribute("disabled") == "true")
        return;
    var bg = chrome.extension.getBackgroundPage();
    var doc = window.frames["tree-iframe"].document;
    var container = doc.getElementById("imacros-macro-container");
    var div = doc.getElementById("imacros-bookmark-div");
    var bookmark_id = div.getAttribute("bookmark_id"),
        source = container.value,
        name = div.getAttribute("name");
    bg.edit({name: name, source: source, bookmark_id: bookmark_id}, true);
}


// Record button handler
function record() {
    var win_id = args.windowId;
    var bg = chrome.extension.getBackgroundPage();
    var recorder = bg.context[win_id].recorder;
    try {
        recorder.start();
    } catch (e) {
        console.error(e.toString());
    } 
}

// Stop button handler
function stop() {
    var win_id = args.windowId;
    var bg = chrome.extension.getBackgroundPage();
    
    var mplayer = bg.context[win_id].mplayer;
    var recorder = bg.context[win_id].recorder;
    
    try {
        if (mplayer.playing) {
            mplayer.stop();
        } else if (recorder.recording) {
            recorder.stop();
            var recorded_macro = recorder.actions.join("\n");
            bg.edit({source: recorded_macro}, false);
        }
    } catch (e) {
        console.error(e.toString());
    } 
}


// called when a macro is selected in tree-view
function onSelectionChanged(selected) {
    var disable = function (btns) {
        for (var x = 0; x < arguments.length; x++) {
            var b = $(arguments[x]+"-button");
            b.setAttribute("disabled", "true");
            var title = b.getAttribute("title");
            b.setAttribute("origtitle", title);
            b.setAttribute("title", "Choose macro to activate button");
        }
    };
    var enable = function (btns) {
        for (var x = 0; x < arguments.length; x++) {
            var b = $(arguments[x]+"-button");
            b.setAttribute("disabled", "false");
            var title = b.getAttribute("origtitle");
            b.setAttribute("title", title);
        }
    };

    // change 'disabled' status of buttons
    if (selected) {
        enable("play", "loop", "edit");
    } else {
        disable("play", "loop", "edit");
    }
}


function updatePanel(state) {
    var show = function (btns) {
        for (var x = 0; x < arguments.length; x++) {
            $(arguments[x]+"-button").setAttribute("collapsed", "false");
        }
    };
    var hide = function (btns) {
        for (var x = 0; x < arguments.length; x++) {
            $(arguments[x]+"-button").setAttribute("collapsed", "true");
        }
    };
    switch(state) {
    case "playing":
        show("pause", "stop");
        hide("play", "record");
        break;
    case "paused":
        // TODO: change tooltip for Play button
        show("play", "stop");
        hide("pause", "record");
        break;
    case "recording":
        show("stop");
        hide("pause", "record", "play");
        break;
    case "idle":
        show("play", "record");
        hide("stop", "pause");
        break;
    }
    
}

window.addEventListener("load", function() {
});


function checkNumberKey(e) {
    var char = String.fromCharCode(e.which)
    return /\d/.test(char)
}

function setLoopValue(val) {
    $("current-loop").value = val;
}
