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



function createBookmark(folder_id, title, url, bookmark_id, overwrite) {
    if (bookmark_id) {
        // chrome.bookmarks.update(id, {url: url}, function () {});
        // TODO: change to update() when it works properly
        chrome.bookmarks.get(bookmark_id, function (x) {
            var index = x[0].index;
            var parentId = x[0].parentId;
            chrome.bookmarks.remove(bookmark_id, function () {
                chrome.bookmarks.create(
                    {
                        parentId: parentId,
                        title: title,
                        index: index,
                        url: url
                    },
                    function() {}
                );
            });
        });
    } else {
        if (overwrite) {
            console.error("bg.save() - trying to overwrite "+title+
                          " while bokmark_id is not set");
            return;
        }
        // look for the same name
        // append (\d) to title if macro with title already exists
        chrome.bookmarks.getChildren(folder_id, function (children) {
            var found = false, count = 0, name = title;
            for(;;) {
                children.forEach(function(x) {
                    if (x.title == name && x.url) { // found 
                        found = true; count++;
                    }
                });
                if (found) {
                    name = title+"("+count+")"; found = false;
                    continue;
                } else {
                    break;
                }
            } 
            chrome.bookmarks.create({
                parentId: folder_id,
                title: name,
                url: url}, function() {});
            
        });
    }
}



function save(save_data, overwrite) {
    console.log("saving "+save_data.name);

    var pattern = "(function() {"+
        "var m64 = \"{{macro}}\", n = \"{{name}}\";"+
        "if(!/Chrome\\/\\d+\\.\\d+\\.\\d+\\.\\d+/test(navigator.userAgent)){"+
           "alert('iMacros: The embedded macros work with iMacros for Chrome. Support for IE/Firefox is planned.');"+
           "return;"+
        "}"+
        "if(!/^(?:chrome|https?|file)/.test(location)){"+
            "alert('iMacros: To run a macro, you need to open a website first.');"+
           "return;"+
        "}"+
        "var div = document.getElementById(\"imacros-bookmark-div\");"+
        "if (!div){"+
           "alert(\"Can not run macro, no iMacros div found\");"+
           "return;"+
        "}"+
        "var ta = document.getElementById(\"imacros-macro-container\");"+
        "ta.value = decodeURIComponent(atob(m64));"+
        "div.setAttribute(\"name\", n);"+
        "var evt = document.createEvent(\"Event\");"+
        "evt.initEvent(\"iMacrosRunMacro\", true, true);"+
        "div.dispatchEvent(evt);"+
    "}) ();";
    
    var name = save_data.name, source = save_data.source;
    if (!name)
        name = "Unnamed Macro";
    name = im_StrHelper.escapeLine(name);
    pattern = pattern.replace("{{name}}", name);
    source = btoa(encodeURIComponent(source));
    source = im_StrHelper.escapeLine(source);
    pattern = pattern.replace("{{macro}}", source);
    
    var url = "javascript:" + pattern;
        
    chrome.bookmarks.getTree( function (tree) {
        var found = false,
            iMacrosFolderId = -1,
            bookmarksPanelId = tree[0].children[0].id;

        tree[0].children[0].children.forEach(function(child) {
            if (child.title == "iMacros") {
                found = true;
                iMacrosFolderId = child.id;
            }
        });

        if (!found) {
            console.log("creating iMacros folder");
            chrome.bookmarks.create(
                {
                    parentId: bookmarksPanelId,
                    title: "iMacros"
                },
                function (folder) {
                    createBookmark(
                        folder.id, name, url,
                        save_data.bookmark_id,
                        overwrite
                    );
                }
            );
        } else {
            createBookmark(
                iMacrosFolderId, name, url,
                save_data.bookmark_id,
                overwrite
            );
        }
    });
}


function edit(macro, overwrite) {
    console.log("editing macro:");
    console.dir(macro);
    var features = "titlebar=no,menubar=no,location=no,"+
        "resizable=yes,scrollbars=yes,status=no,"+
        "width=640,height=480";
    // var win = window.open("editor/simple_editor.html",
    //     null, features);
    var win = window.open("editor/editor.html",
        null, features);
    
    win.args = {macro: macro, overwrite: overwrite};
}


function playMacro(macro, windowId) {
    if (context[windowId]) {
        context[windowId].mplayer.play(macro);
    } else {
        console.error("no context for windowId="+windowId);
    }
}

function openPanel(windowId) {
    var features = "titlebar=no,menubar=no,location=no,"+
        "resizable=no,scrollbars=no,status=no,"+
        "height=500,width=210";
    context[windowId].panelWindow =
        window.open("panel.html", "iMacros_panel_"+windowId, features);
    context[windowId].panelWindow.args = {windowId: windowId};
}


// browser action button onclick handler
chrome.browserAction.onClicked.addListener(function(tab) {
    var win_id = tab.windowId;
    var mplayer = context[win_id].mplayer;
    var recorder = context[win_id].recorder;

    if (!context[win_id]) {
        console.error("No context for window "+win_id);
    }

    console.log("onClicked, state="+context[win_id].state);
    if (context[win_id].state == "idle") {
        var panel = context[win_id].panelWindow;
        if (!panel || panel.closed) {
            openPanel(tab.windowId);
        } else {
            panel.close();
        }
    } else if (context[win_id].state == "paused") {
        console.log("mplayer.paused="+mplayer.paused);
        if (mplayer.paused) {
            mplayer.unpause();
        }
    } else {
        if (mplayer.playing) {
            mplayer.stop();
        } else if (recorder.recording) {
            recorder.stop();
            var recorded_macro = recorder.actions.join("\n");
            edit({source: recorded_macro}, false);
        }
    }
});


window.addEventListener("load", function (event) {
    // initialize context
    context.init();

    // listen to run-macro command from content script 
    communicator.registerHandler("run-macro", function (data, tab_id) {
        // TODO: don't forget to change that when crbug/28599 is fixed
        chrome.windows.getLastFocused(function (w) {
            console.log("run-macro "+data.name);
            if (Storage.getBool("before-play-dialog")) {
                var features = "titlebar=no,menubar=no,location=no,"+
                    "resizable=yes,scrollbars=yes,status=no,"+
                    "width=400, height=140";
                var win = window.open("beforePlay.html", null, features);
                win.args = data;
                win.args.windowId = w.id;
            } else {
                setTimeout(function () {
                    context[w.id].mplayer.play(data);
                }, 0);
            }
        });
    });

    // check if it is the first run
    if (!Storage.getBool("already-installed")) {
        // make initial settings
        Storage.setBool("already-installed", true);
        Storage.setBool("before-play-dialog", true);
    }

    // debug messages from content script
    communicator.registerHandler("cs-debug", function (data, tab_id) {
        console.debug(data.message);
    });

}, true);


// remove panel when its parent window is closed
chrome.windows.onRemoved.addListener(function(win_id) {
    if (!context[win_id])
        return;
    var panel = context[win_id].panelWindow;
    if (panel && !panel.closed) {
        panel.close();
    }
});

