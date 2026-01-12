/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/


function play() {
    var m = {source: args.source, name: args.name};
    var windowId = args.windowId;
    var showAgain = $("checkbox").checked;
    setTimeout( function () {
        window.opener.playMacro(m, windowId);
        opener.Storage.setBool("before-play-dialog", showAgain);
    }, 0);
    window.close();
}

function cancel() {
    opener.Storage.setBool("before-play-dialog", $("checkbox").checked);
    window.close();
}

function edit() {
    var m = {source: args.source, name: args.name};
    setTimeout(function () {window.opener.edit(m);}, 0);
    opener.Storage.setBool("before-play-dialog", $("checkbox").checked);
    window.close();
}

window.addEventListener("load", function(evt) {
    if (args) {
        var x = $("message").innerHTML;
        x = x.replace(/{{macroname}}/, args.name);
        $("message").innerHTML = x;
    }
    $("play-button").focus();
    $("checkbox").checked = opener.Storage.getBool("before-play-dialog");
}, true);
