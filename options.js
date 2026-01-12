/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/

// preference storage
var Storage = {
    isSet: function(key) {
        return typeof(localStorage[key]) != "undefinded";
    },

    setBool: function(key, value) {
        localStorage[key] = Boolean(value);
    },

    getBool: function(key) {
        var value = localStorage[key];
        return value ? value.toString() != "false" : false;
    },

    setChar: function(key, value) {
        localStorage[key] = String(value);
    },

    getChar: function(key) {
        var value = localStorage[key];
        return value ? value.toString() : "";
    }
};




function on_BP_change() {
    var bpbox = $("show-before-play-dialog");
    Storage.setBool("before-play-dialog", bpbox.checked);
}


function onPasswordChange() {
    var pwd = $("stored-password").value;
    pwd = btoa(encodeURIComponent(pwd));
    Storage.setChar("stored-password", pwd);
    $("stored-password").blur();
}

function setSecurityLevel() {
    if (!Storage.isSet("encryption-type"))
        Storage.setChar("encryption-type", "no");
    var type = Storage.getChar("encryption-type");
    if (!/^(?:no|stored|tmpkey)$/.test(type))
        type = "no";
    $("stored-password").value = Storage.getChar("stored-password");
    switch(type) {
    case "no":
        $("type_no").click();
        $("stored-password").disabled = true;
        break;
    case "stored":
        $("type_stored").click();
        $("stored-password").disabled = null;
        break;
    case "tmpkey":
        $("type_tmpkey").click();
        $("stored-password").disabled = true;
        break;
    }
}

function onSecurityChage(e) {
    var type = e.target.id.substring(5);
    switch(type) {
    case "no":
        $("stored-password").disabled = true;
        break;
    case "stored":
        $("stored-password").disabled = null;
        $("stored-password").focus();
        $("stored-password").select();
        break;
    case "tmpkey":
        $("stored-password").disabled = true;
        break;
    }
    Storage.setChar("encryption-type", type);
}


function enterTempKey() {
    var features = "titlebar=no,menubar=no,location=no,"+
        "resizable=yes,scrollbars=yes,status=no,"+
        "width=350,height=170";
    var win = window.open("passwordDialog.html",
        null, features);
    win.args = {
        shouldProceed: false    // no need to execute next action
    };
}



window.addEventListener("load", function () {
    var bpbox = $("show-before-play-dialog");
    bpbox.checked = Storage.getBool("before-play-dialog");
    setSecurityLevel();
});