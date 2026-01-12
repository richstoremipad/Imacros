/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/

function handlePlayerCase() {
    var bg = chrome.extension.getBackgroundPage();
    var pwd = $("password");
    var data = args.data;
    try {
        // throws error if password does not match
        var txt = bg.Rijndael.decryptString(data.txt, pwd.value);
        data.txt = txt;
        bg.Rijndael.tempPassword = pwd.value;
        // continue replaying
        args.mplayer.waitingForPassword = false;
        chrome.tabs.getSelected(args.mplayer.windowId, function(tab) {
            try {
                bg.communicator.postMessage("tag-command", data, tab.id);
                args.mplayer.next("passwordDialog");
            } catch (e) {
                args.mplayer.handleError(e);
            }
        });
        window.close();
    } catch (e) {
        if (!confirm("Wrong password!\nWould you like to proceed?")) {
            cancel();
            return;
        }
        $("password").focus();
    }
}


function handleRecorderCase() {
    var bg = chrome.extension.getBackgroundPage();
    var pwd = $("password"), cyphertext;
    bg.Rijndael.tempPassword = pwd.value;
    console.log("handleRecorderCase, password: "+pwd.value);
    cyphertext = bg.Rijndael.encryptString(args.plaintext, pwd.value);
    console.log("handleRecorderCase, cyphertext: "+cyphertext);
    args.cmd = args.cmd.replace(/(content)=(\S+)\s*$/i, "$1="+cyphertext);
    console.log("handleRecorderCase, cmd: "+args.cmd);
    args.recorder.actions.splice(args.actionIndex, 0, args.cmd);
    window.close();
}

function ok() {
    var bg = chrome.extension.getBackgroundPage();
    var pwd = $("password");
    if (!args.shouldProceed) {
        bg.Rijndael.tempPassword = pwd.value;
        window.close();
        return;
    }
    if (args.type == "recorder") {
        handleRecorderCase();
    } else if (args.type == "player") {
        handlePlayerCase();
    }
}

function cancel() {
    if (args.shouldProceed) {
        if (args.type == "player") {
            var e = new RuntimeError("Password input has been canceled", 943);
            args.mplayer.handleError(e);
        } else if (args.type == "recorder") {
            
        }
    }
    window.close();
}


window.addEventListener("load", function(evt) {
    $("password").focus();
    if (args) {
        // 
    }
}, true);
