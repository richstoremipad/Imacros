/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/



//  Add a hidden div to listen to macro bookmarklets
window.addEventListener("load", function () {
    if (window.top != self)
        return;
    var div = $("imacros-bookmark-div"),
        ta = $("imacros-macro-container");
    if (!div) {
        div = document.createElement("div");
        div.id = "imacros-bookmark-div";
        div.style.display = "none";
        document.body.appendChild(div);
        var ta = document.createElement("textarea");
        ta.id = "imacros-macro-container";
        div.appendChild(ta);
    }
    div.addEventListener("iMacrosRunMacro", function(event) {
        var name = $("imacros-bookmark-div").getAttribute("name");
        var source = $("imacros-macro-container").value;
        connector.postMessage("run-macro", {name: name,
                                            source: source});
    }, true);
}, true);


