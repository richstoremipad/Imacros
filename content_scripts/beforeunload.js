/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/

window.addEventListener("beforeunload", function () {
    if (window.top.connector)
        top.connector.postMessage("content-change", {
            url: window.location.toString(),
            baseURL: window.top.location.toString()
        });
    else {
        console.error("Can't access connector");
    }
});

