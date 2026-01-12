/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/


// An object to encapsulate all operations for parsing
// and playing macro commands

function MacroPlayer(windowId) {
    this.windowId = windowId;
    this.vars = new Array(3);
    this.userVars = new Object();
    this.ports = new Object();
    this.compileExpressions();
    this.addListeners();
}

// Object for debugging time intervals while replaying
var DebugTimer = {
    start: function () {
        this._start = (new Date()).getTime();
    },

    get: function () {
        return (new Date()).getTime() - this._start;
    }
}

// A table to hold the code for processing a command
MacroPlayer.prototype.ActionTable = new Object();
MacroPlayer.prototype.RegExpTable = new Object();



// compile actions regexps
MacroPlayer.prototype.compileExpressions = function () {
    for (var x in this.RegExpTable) {
        try {
            this.RegExpTable[x] = new RegExp(this.RegExpTable[x], "i");
            this.ActionTable[x] = this.ActionTable[x].bind(this);
        } catch (e) {
            console.error(e.toString());
            throw e;
        }
    }
};



// add listener for various events
MacroPlayer.prototype.addListeners = function() {
    // receive messages from content scripts
    communicator.registerHandler("tag-command-complete",
                                 this.onTagComplete.bind(this),
                                 this.windowId);
    communicator.registerHandler("prompt-command-complete",
                                 this.onPromptComplete.bind(this),
                                 this.windowId);
    var mplayer = this;
    
    communicator.registerHandler("content-change", function(data, tab_id) {
        chrome.tabs.getSelected(mplayer.windowId, function(tab) {
            if (tab_id != tab.id) 
                return;
            if (mplayer.playing) {
                mplayer.waitingForPageLoad = true;
                console.debug("CS: content change, url="+tab.url);
            }
        }),
        this.windowId
    });
    
    // listen to page load events
    chrome.tabs.onUpdated.addListener(function(tab_id, obj) {
        chrome.tabs.getSelected(mplayer.windowId, function(tab) {
            if (tab_id != tab.id) 
                return;
            if (/^(?:https?|file)/.test(tab.url))
                mplayer.currentURL = tab.url;
            if (obj.status == "loading") {
                // now work is done in content-change
                // maybe "loading" is more reliable...
            } else if (obj.status == "complete") {
                if (mplayer.playing && mplayer.waitingForPageLoad) {
                    mplayer.waitingForPageLoad = false;
                    mplayer.playNextAction("Page load complete, url="+tab.url);
                }
            }
        });
    });
};



// handle messages from content-scripts
MacroPlayer.prototype.onTagComplete = function(data, tab_id) {
    var mplayer = this;
    chrome.tabs.getSelected(mplayer.windowId, function(tab) {
        if (tab_id != tab.id) {
            return;
        }
        // console.debug("onTagComplete, retobj="+__obj2str(data));
        if (data.error) {
            mplayer.handleError(data.error);
        } else {
            if (data.extract)
                mplayer.showAndAddExtractData(data.extract);
            mplayer.next("onTagComplete");
        }
    });
};


// a pattern to match a double quoted string or a non-whitespace char sequence
const im_strre = "(?:\"(?:[^\"\\\\]|\\\\[0btnvfr\"\'\\\\])*\"|\\S*)";



// ADD command http://wiki.imacros.net/ADD
// regexp for parsing ADD command
MacroPlayer.prototype.RegExpTable["add"] =
    "^(\\S+)\\s+("+im_strre+")\\s*$";

MacroPlayer.prototype.ActionTable["add"] = function (cmd) {
    var param = im_StrHelper.unwrapLine(this.expandVariables(cmd[2]));
    var arr = null, num;
    
    if ( arr = cmd[1].match(/^!var([123])$/i) ) {
        num = __int(arr[1]);
        var n1 = __int(this.vars[num]), n2 = __int(param);
        if ( !isNaN(n1) && !isNaN(n2) ) {
            this.vars[num] = (n1 + n2).toString();
        } else {
            this.vars[num] += param;
        }
    } else if ( arr = cmd[1].match(/^!extract$/i) ) {
        this.addExtractData(param);
    } else {
        throw new BadParameter("!VAR[123] or !EXTRACT", 1);
    }

    this.next("ADD");
};




// PAUSE command http://wiki.imacros.net/PAUSE
MacroPlayer.prototype.RegExpTable["pause"] = "^\\s*$";

MacroPlayer.prototype.ActionTable["pause"] = function (cmd) {
    this.pause();
    this.next("PAUSE");
};


// PROMPT command http://wiki.imacros.net/PROMPT
MacroPlayer.prototype.RegExpTable["prompt"] =
    "^("+im_strre+")"+
    "(?:\\s+!var([123])"+
    "(?:\\s+("+im_strre+"))?)?\\s*$";

MacroPlayer.prototype.ActionTable["prompt"] = function (cmd) {
    var x = {};
    x.text = im_StrHelper.unwrapLine(this.expandVariables(cmd[1]));
    x.varnum = cmd[2] ? __int(cmd[2]) : 0;
    x.defval = cmd[3] ?
        im_StrHelper.unwrapLine(this.expandVariables(cmd[3])) : "";
    var mplayer = this;
    chrome.tabs.getSelected(this.windowId, function(tab) {
        try {
            communicator.postMessage("prompt-command", x, tab.id);
        } catch (e) {
            mplayer.handleError(e);
        }
    });
};

MacroPlayer.prototype.onPromptComplete = function(data, tab_id) {
    var mplayer = this;
    chrome.tabs.getSelected(mplayer.windowId, function(tab) {
        if (tab_id != tab.id) {
            return;
        }
        if (data.varnum) {
            // TODO: someday extend iMacros PROMPT setting
            // any variable, then varnum may become varname
            mplayer.vars[__int(data.varnum)] = data.value;
        }
        mplayer.next("onPromptComplete");
    });
};


// REFRESH command http://wiki.imacros.net/REFRESH
MacroPlayer.prototype.RegExpTable["refresh"] = "^\\s*$";

MacroPlayer.prototype.ActionTable["refresh"] = function (cmd) {
    chrome.tabs.getSelected(this.windowId, function(tab) {
        if (/^(?:https?|file)/.test(tab.url))
            communicator.postMessage("refresh-command", {}, tab.id);
    });
    // mplayer.next() will be called on load-complete event
};




// SET command http://wiki.imacros.net/SET
MacroPlayer.prototype.RegExpTable["set"] =
    "^!(\\S+)\\s+("+im_strre+")\\s*$";


MacroPlayer.prototype.ActionTable["set"] = function (cmd) {
    var param = im_StrHelper.unwrapLine(this.expandVariables(cmd[2]));
    switch(cmd[1].toLowerCase()) {
    case "encryption":
        switch(param.toLowerCase()) {
        case "no":
            this.encryptionType = "no"; break;
        case "storedkey": case "yes":
            this.encryptionType = "stored"; break;
        case "tmpkey": 
            this.encryptionType = "tmpkey"; break;
        default:
            throw new BadParameter("!ENCRYPTION can be only "+
                                   "YES|NO|STOREDKEY|TMPKEY");
        }
        
        break;
    case "downloadpdf":
        this.shouldDownloadPDF = /^yes$/i.test(param); break;
    case "loop":
        if (this.firstLoop) {
            if (isNaN(__int(param)))
                throw new BadParameter("!LOOP must be integer");
            this.currentLoop = __int(param);
            var panel = context[this.windowId].panelWindow;
            if (panel && !panel.closed)
                panel.setLoopValue(this.currentLoop);
        }
        break;
    case "extract":
        this.clearExtractData();
        if (!/^null$/i.test(param))
            this.addExtractData(param);
        break;
    case "extractadd":
        this.addExtractData(param); break;
    case "extract_test_popup":
        this.shouldPopupExtract = /^yes$/i.test(param); break;
    case "errorignore":
        this.ignoreErrors = /^yes$/i.test(param); break;
    case "timeout":
        var x = __int(param);
        if (isNaN(x) || x <= 0)
            throw new BadParameter("!TIMEOUT must be positive integer");
        this.timeout = x;
        break;
    case "clipboard":
        im_Clipboard.putString(param);
        break;
    default:
        if (/^var([123])$/i.test(cmd[1]))
            this.vars[__int(RegExp.$1)] = param;
        else
            throw new BadParameter("Variable not supported "+cmd[1]);
    }
    this.next("SET");
};




// STOPWATCH command http://wiki.imacros.net/STOPWATCH
MacroPlayer.prototype.RegExpTable["stopwatch"] =
    "^((?:(start|stop)\\s+)?id|label)\\s*=\\s*("+im_strre+")\\s*$";

// add new time watch
MacroPlayer.prototype.addTimeWatch = function(name) {
    this.watchTable[name] = this.globalTimer.getElapsedTime();
};


MacroPlayer.prototype.stopTimeWatch = function(name) {
    if (typeof this.watchTable[name] == "undefined")
        throw new RuntimeError("time watch "+name+" does not exist", 962);
    var elapsed = this.globalTimer.getElapsedTime() - this.watchTable[name];
    this.lastWatchValue = elapsed;
    var x = {id: name, type: "id", elapsedTime: elapsed};
    this.stopwatchResults.push(x);
};


MacroPlayer.prototype.addTimeWatchLabel = function(name) {
    var elapsed = this.globalTimer.getElapsedTime();
    this.lastWatchValue = elapsed;
    var x = {id: name, type: "label", elapsedTime: elapsed};
    this.stopwatchResults.push(x);
};


// command handler
MacroPlayer.prototype.ActionTable["stopwatch"] = function (cmd) {
    var action = cmd[2] ? cmd[2].toLowerCase() : null;
    var use_label = /label$/i.test(cmd[1]);
    var param = im_StrHelper.unwrapLine(this.expandVariables(cmd[3]));

    // make the watch name uppercase to be compatible with IE version
    param = param.toUpperCase();
    
    if (!use_label) {
        var found = typeof this.watchTable[param] != "undefined";
        switch (action) {
        case "start":
            if (found)
                throw new RuntimeError("stopwatch id="+param+
                                      " already started");
            this.addTimeWatch(param);
            break;
        case "stop":
            if (!found)
                throw new RuntimeError("stopwatch id="+param+
                                       " wasn't started");
            this.stopTimeWatch(param);
            break;
        default:                // old syntax
            if (found) 
                this.stopTimeWatch(param);
            else 
                this.addTimeWatch(param);
            break;
        }
    } else {
        // save time in sec since macro was started
        this.addTimeWatchLabel(param);
    }
    this.next("STOPWATCH");
};


MacroPlayer.prototype.globalTimer = {
    init: function(mplayer) {
        this.mplayer = mplayer;
        if (this.macroTimeout) {
            clearTimeout(this.macroTimeout);
            this.macroTimeout = null;
        }
    },

    start: function() {
        this.startTime = new Date();
    },

    getElapsedTime: function() {
        if (!this.startTime)
            return 0;
        var now = new Date();
        return (now.getTime()-this.startTime.getTime())/1000;
    },

    setMacroTimeout: function(x) {
        this.macroTimeout = setTimeout( function () {
            if (!this.mplayer.playing)
                return;
            this.mplayer.handleError(
                new RuntimeError(
                    "Max. macro runtime was reached. Macro stopped.", 803
                )
            );
        }, Math.round(x*1000));
    },

    stop: function() {
        if (this.macroTimeout) {
            clearTimeout(this.macroTimeout);
            this.macroTimeout = null;
        }
    }
};



// TAG command http://wiki.imacros.net/TAG

// regexp for matching att1:"val1"&&att2:val2.. sequence
const im_atts_re = "(?:[-\\w]+:"+im_strre+"(?:&&[-\\w]+:"+im_strre+")*|\\*?)";

MacroPlayer.prototype.RegExpTable["tag"] =
    "^(?:pos\\s*=\\s*(\\S+)\\s+"+
    "type\\s*=\\s*(\\S+)"+
    "(?:\\s+form\\s*=\\s*("+im_atts_re+"))?\\s+"+
    "attr\\s*=\\s*("+im_atts_re+")"+
    "|xpath\\s*=\\s*("+im_strre+"))"+
    "(?:\\s+(content|extract)\\s*=\\s*"+
    "(\\d+(?::\\d+)*|"+                       // indices 1:5:4 ...
    "[%$]"+im_strre+"(?::[%$]"+im_strre+")*|" // or values %goo:$"zoo"
    +im_strre+"))?\\s*$";                     // or a common string

MacroPlayer.prototype.ActionTable["tag"] = function (cmd) {
    // form message to send to content-script
    var data = {
        pos: 0,
        relative: false,
        tagName: "",
        form: null,
        atts: null,
        xpath: null,
        type: "",
        txt: null,
        scroll: true,
        highlight: true
    };

    var isPasswordElement = false;
    
    // parse attr1:val1&&atr2:val2...&&attrN:valN string
    // into array of regexps corresponding to vals
    var mplayer = this;
    var parseAtts = function(str) {
        if (!str || str == "*")
            return null;
        var arr = str.split(new RegExp("&&(?=[-\\w]+:"+im_strre+")"));
        var parsed_atts = new Object(), at, val, m;
        const re = new RegExp("^([-\\w]+):("+im_strre+")$");
        for (var i = 0; i < arr.length; i++) {
            if (!(m = re.exec(arr[i])))
                throw new BadParameter("incorrect ATTR or FORM specifier: "
                                       +arr[i]);
            at = m[1].toLowerCase();
            if (at.length) {
                val = im_StrHelper.unwrapLine(mplayer.expandVariables(m[2]));
                // While replaying:
                // 1. remove all leading/trailing whitespaces 
                // 2. remove all linebreaks in the target string
                val = im_StrHelper.escapeTextContent(val);
                val = im_StrHelper.escapeREChars(val);
                val = val.replace(/\*/g, '(?:\n|.)*');
                // 3. treat all <SP> as a one or more whitespaces
                val = val.replace(/ /g, "\\s+");
                parsed_atts[at] = "^\\s*"+val+"\\s*$";
            } else {
                parsed_atts[at] = "^$";
            }
        }

        return parsed_atts;
    };
    
    if (cmd[5]) {
        data.xpath = im_StrHelper.unwrapLine(this.expandVariables(cmd[5]));
    } else {
        data.pos = im_StrHelper.unwrapLine(this.expandVariables(cmd[1]));
        data.tagName = im_StrHelper.unwrapLine(this.expandVariables(cmd[2])).
               toLowerCase();
        data.form = parseAtts(cmd[3]);
        data.atts = parseAtts(cmd[4]);
        data.atts_str = cmd[4]; // for error message

        // get POS parameter
        if (/^r(-?\d+)$/i.test(data.pos)) {
            data.pos = __int(RegExp.$1);
            data.relative = true;
        } else if (/^(\d+)$/.test(data.pos)) {
            data.pos = __int(RegExp.$1);
            data.relative = false;
        } else {
            throw new BadParameter("POS=<number> or POS=R<number>"+
                                   "where <number> is a non-zero integer", 1);
        }
        // get rid of INPUT:* tag names
        if (/^(\S+):(\S+)$/i.test(data.tagName)) { 
            if (!data.atts)
                data.atts = new Object();
            var val = RegExp.$2;
            data.tagName = RegExp.$1.toLowerCase();
            // check for password element
            isPasswordElement = /password/i.test(val);
            val = im_StrHelper.escapeREChars(val);
            val = val.replace(/\*/g, '(?:\n|.)*');
            data.atts["type"] = "^"+val+"$";
        }

    }
    if (cmd[6]) {
        data.type = cmd[6].toLowerCase();
        data.txt = im_StrHelper.unwrapLine(this.expandVariables(cmd[7]));
    }

    if (isPasswordElement && data.type == "content" && data.txt) {
        switch(this.encryptionType) {
        case "no": break; // do nothing
        case "stored":      // get password from storage
            var pwd = Storage.getChar("stored-password");
            // stored password is base64 encoded
            pwd = decodeURIComponent(atob(pwd));
            // throws error if password does not match
            data.txt = Rijndael.decryptString(data.txt, pwd);
            break;
        case "tmpkey":
            if (!Rijndael.tempPassword) {    // ask password now
                this.waitingForPassword = true;
                var features = "titlebar=no,menubar=no,location=no,"+
                    "resizable=yes,scrollbars=yes,status=no,"+
                    "width=350,height=170";
                var win = window.open("passwordDialog.html",
                    null, features);
                win.args = {
                    shouldProceed: true,
                    type: "player",
                    data: data,
                    mplayer: this
                };
                // mplayer.next() and communicator.postMesasge()
                // will be called from win
                return;
            } else {
                // throws error if password does not match
                data.txt = Rijndael.decryptString(
                    data.txt,
                    Rijndael.tempPassword
                );
            }
            break;
        default:
            throw new RuntimeError("Unsupported encryption type: "+
                               this.encryptionType);
            break;
        }
    }
    
    chrome.tabs.getSelected(this.windowId, function(tab) {
        communicator.postMessage("tag-command", data, tab.id);
    });
    
};





// VERSION command http://wiki.imacros.net/VERSION
MacroPlayer.prototype.RegExpTable["version"] = "^(?:build\\s*=\\s*(\\S+))?"+
    "(?:\\s+recorder\\s*=\\s*(\\S+))?\\s*$";
MacroPlayer.prototype.ActionTable["version"] = function (cmd) {
    // do nothing
    this.next("VERSION");
};



// URL command http://wiki.imacros.net/URL
MacroPlayer.prototype.RegExpTable["url"] =
    "^goto\\s*=\\s*("+im_strre+")\\s*$";

MacroPlayer.prototype.ActionTable["url"] = function (cmd) {
    var param = im_StrHelper.unwrapLine(this.expandVariables(cmd[1])),
        scheme = null;
    
    if (!/^([a-z]+):.*/i.test(param)) {
        param = "http://"+param;
    }
    var mplayer = this;    
    chrome.tabs.getSelected(this.windowId, function (tab) {
        chrome.tabs.update(tab.id, {url: param},
                           function () {
                               mplayer.waitingForPageLoad = true;
                           });
    });
};




// TAB command http://wiki.imacros.net/TAB
MacroPlayer.prototype.RegExpTable["tab"] = "^(t\\s*=\\s*(\\S+)|"+
    "close|closeallothers|open|open\\s+new|new\\s+open"+
    ")\\s*$";

MacroPlayer.prototype.ActionTable["tab"] = function (cmd) {
    var mplayer = this;
    if (/^close$/i.test(cmd[1])) { // close current tab
        chrome.tabs.getSelected(mplayer.windowId, function (tab) {
            chrome.tabs.remove(tab.id);
            mplayer.next("TAB CLOSE");
        });
    } else if (/^closeallothers$/i.test(cmd[1])) {
        //close all tabs except current
        chrome.tabs.getAllInWindow(mplayer.windowId, function (tabs) {
            try {
                tabs.forEach( function (tab) {
                    if (!tab.selected) {
                        chrome.tabs.remove(tab.id);
                    }
                    mplayer.startTabIndex = 0;
                });
                mplayer.next("TAB CLOSEALLOTHERS");
            } catch (e) {
                console.error(e.toString());
            }
        });

    } else if (/open/i.test(cmd[1])) {
        
        var args = {
            url: "about:blank",
            windowId: mplayer.windowId,
            index: (mplayer.startTabIndex+1),
            selected: true
        };
        try {
            chrome.tabs.create(args, function (tab) {
                mplayer.next("TAB OPEN");
            });
        } catch (e) {
            console.error(e);
        }
        
    } else if (/^t\s*=/i.test(cmd[1])) {
        var n = __int(mplayer.expandVariables(cmd[2]));
        if (isNaN(n))
            throw new BadParameter("T=<number>", 1);
        var tab_num = n+mplayer.startTabIndex-1;
        chrome.tabs.getAllInWindow(mplayer.windowId, function (tabs) {
            if (tab_num >= 0 && tab_num < tabs.length ) {
                chrome.tabs.update(tabs[tab_num].id,
                                   {url: tabs[tab_num].url, selected: true},
                                   null);
                mplayer.next("TAB T=");
            } else {
                mplayer.handleError(new RuntimeError("Tab number "+(tab_num+1)+
                                       " does not exist", 971));
            }
        });
    }
};



// WAIT command http://wiki.imacros.net/WAIT
MacroPlayer.prototype.RegExpTable["wait"] = "^seconds\\s*=\\s*(\\S+)\\s*$";

MacroPlayer.prototype.ActionTable["wait"] = function (cmd) {
    var param = Number(im_StrHelper.unwrapLine(this.expandVariables(cmd[1])));
    
    if (isNaN(param))
        throw new BadParameter("SECONDS=<number>", 1);
    param = Math.round(param*10)*100; // get number of ms
    if (param == 0)
        param = 10;
    else if (param < 0)
        throw new BadParameter("positive number of seconds", 1);
    this.inWaitCommand = true;
    var mplayer = this;
    
    this.waitTimeout = setTimeout(function () {
        mplayer.inWaitCommand = false;
        delete mplayer.waitTimeout;
        mplayer.playNextAction("WAIT");
    }, param);

    // show countdown timer
    var counter = Math.round(param/1000);
    var countdown = setInterval(function () {
        if (!mplayer.inWaitCommand) {
            clearInterval(countdown);
            return;
        }
        counter--;
        if (counter) {
            var text = counter.toString();
            while(text.length < 3) text = "0"+text;
            chrome.browserAction.setBadgeBackgroundColor(
                {color: [100,255,100,200]}
            );
            chrome.browserAction.setBadgeText({text: text});
        }
    }, 1000);
};





// reset all defaults, should be called on every play
MacroPlayer.prototype.reset = function() {
    // clear actions array
    this.actions = new Array();
    this.currentAction = null;
    // source code
    this.source = "";
    // stopwatch-related properties
    this.watchTable = new Object();
    this.stopwatchResults = new Array();
    // last stopwatch value for !STOPWATCHTIME
    this.lastWatchValue = 0;
    this.totalRuntime = 0;
    this.lastPerformance = "";
    // init runtime timer
    this.globalTimer.init(this);
    
    // reset state variables
    this.ignoreErrors = false;
    this.playing = false;
    this.paused = false;
    this.pauseIsPending = false;
    // current loop value
    this.currentLoop = 0;
    this.firstLoop = true;
    // action is replaying again (only for TAG command) 
    this.playingAgain = false;
    this.waitingForDownload = false;
    this.waitingForPageLoad = false;
    this.waitingForPassword = false;
    this.inWaitCommand = false;
    // extraction
    this.extractData = "";
    this.shouldPopupExtract = true;
    // timeout and replaying delay
    this.timeout = 60;          // seconds
    this.delay = 100;           // milliseconds
    // current tab index
    this.startTabIndex = -1; // special initial value, will be checked later
    var mplayer = this;
    chrome.tabs.getSelected(this.windowId, function (tab) {
        mplayer.startTabIndex = tab.index;
        mplayer.currentURL = tab.url;
    });
    // last error code and message
    this.errorCode = 1;
    this.errorMessage = "";
    // if this is a cycled replay
    this.cycledReplay = false;
    // encryption type
    var typ = Storage.getChar("encryption-type");
    if (!typ.length)
        typ = "no";
    this.encryptionType = typ;
    this.waitingForPassword = false;
};


MacroPlayer.prototype.pause = function() {
    this.pauseIsPending = true;
    context.updateState(this.windowId, "paused");
};

MacroPlayer.prototype.unpause = function () {
    this.paused = false;
    context.updateState(this.windowId, "playing");
    this.next("unpause");
};



// Start macro replaying
// @macro is a macro name
// @loopnum - positive integer
// which should be used to specify cycled replaying
MacroPlayer.prototype.play = function(macro, times, startLoop) {
    const comment = new RegExp("^\\s*(?:'.*)?$");
    
    try {
        // re-initialize variables
        this.reset();
        this.playing = true;
        // store the macro source code
        this.source = macro.source;
        console.log("Playing macro:\n");
        console.dir(macro);
        this.currentMacro = macro.name;
        
        // count lines
        var line_re = /\r?\n/g, count = 0;
        while (line_re.exec(this.source))
            count++;
        // TODO: check macro length
        
        // check number of loops
        this.times = times || 1;
        this.currentLoop = startLoop || 1;
        this.cycledReplay = this.times - startLoop > 0;
        var warnOnLoop = !(this.cycledReplay);

        
        // parse macro file
        this.parseMacro(warnOnLoop);

        // prepare stack of actions
        this.action_stack = this.actions.slice();
        this.action_stack.reverse();
        context.updateState(this.windowId,"playing");

        
        // start replaying
        this.globalTimer.start();
        // 100 ms timeout is required because of async nature of chrome.* api
        var mplayer = this;
        setTimeout(function f() {
            if (mplayer.startTabIndex != -1) {
                console.info("start replaying in window "+mplayer.windowId);
                DebugTimer.start();
                mplayer.playNextAction("start");
            } else {
                console.info("waiting for a while to grab starting tab index");
                setTimeout(f, 100); // TODO: avoid possible recursion
            }
        }, 100);
        
    } catch (e) {
        console.error(e.toString());
        this.handleError(e);
    }
};



// parse macro
MacroPlayer.prototype.parseMacro = function(warnOnLoop) {
    const comment = new RegExp("^\\s*(?:'.*)?$");
    
    // check macro syntax and form list of actions
    this.source = this.source.replace(/\r+/g, ""); // remove \r symbols if any
    var lines = this.source.split("\n");
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].match(comment)) { // skip comments and empty lines
            continue;
        }
        if ( warnOnLoop && /{{!loop}}/i.test(lines[i])) {
            warnOnLoop = false;
            __loginf("TODO: warn on loop dialog");
        }
        if (/^\s*(\w+)(?:\s+(.*))?$/.test(lines[i])) {
            var command = RegExp.$1.toLowerCase();
            var arguments = RegExp.$2 ? RegExp.$2 : "";
            // check if command is known
            if (!(command in this.RegExpTable))
                throw new SyntaxError("unknown command: "+
                                      command.toUpperCase()+
                                      " at line "+(i+1));
            // parse arguments
            var args = this.RegExpTable[command].exec(arguments);
            if ( !args )
                throw new SyntaxError("wrong format of "+
                                      command.toUpperCase()+" command"+
                                      " at line "+(i+1));
            // put parsed action into action list
            this.actions.push({name: command,
                        args: args, line: i+1});
                            
        } else {
            throw new SyntaxError("can not parse macro line: "+lines[i]);
        }
    }
};



// exec current action
MacroPlayer.prototype.exec = function(action) {
    chrome.browserAction.setBadgeBackgroundColor(
        {color: [100,100,255,200]}
    );
    chrome.browserAction.setBadgeText({text: action.line.toString()});
    this.ActionTable[action.name](action.args);
    //this.playingAgain = false;
};

// delayed start of next action
MacroPlayer.prototype.next = function(caller_id) {
    var mplayer = this;
    this.waitingForDelay = true;
    
    if (this.delayTimeout) {
        console.error("delayTimeout is set!");
    }
    this.delayTimeout = setTimeout(function () {
        delete mplayer.delayTimeout;
        mplayer.waitingForDelay = false;
        mplayer.playNextAction(caller_id);
    }, this.delay);
};

MacroPlayer.prototype.playNextAction = function(caller_id) {
    if (!this.playing)
        return;

    if ( this.pauseIsPending ) { // check if player should be paused
        this.pauseIsPending = false;
        this.paused = true;
        return;
    } else if ( this.paused ||
                this.waitingForDelay ||    // replaying delay
                this.waitingForPageLoad || // a page is loading
                this.inWaitCommand ||     // we are in WAIT
                this.waitingForPassword // asking for a password
              ) {
        console.debug("("+DebugTimer.get()+") "+
                      "playNextAction(caller='"+(caller_id || "")+"')"+
                      ", waiting for: "+
                      (this.waitingForDelay ? "delay, " : "")+
                      (this.waitingForPageLoad ? "page load, " : "")+
                      (this.waitingForPassword ? "password, " : "")+
                      (this.inWaitCommand ? "in wait, ": ""));
        // waiting for something
        return;
    }  else {
        // fetch next action
        
        if ( this.action_stack.length ) {
            this.currentAction = this.action_stack.pop();
            try {
                console.debug("("+DebugTimer.get()+") "+
                              "playNextAction(caller='"+(caller_id || "")+ "')"+
                              "\n playing "+
                              this.currentAction.name.toUpperCase()+
                              " command"+
                              ", line: "+this.currentAction.line);
                this.exec(this.currentAction);
            } catch (e) {
                this.handleError(e);
            }            
        } else {
            if (this.currentLoop < this.times) {
                this.currentLoop++;
                var panel = context[this.windowId].panelWindow;
                if (panel && !panel.closed)
                    panel.setLoopValue(this.currentLoop);
                this.action_stack = this.actions.slice();
                this.action_stack.reverse();
                this.next("new loop");
            } else {
                // no more actions left
                this.stop();
            }
        }
    }
};



// handle error
MacroPlayer.prototype.handleError = function (e) {
    this.errorCode = e.errnum ? -1*Math.abs(e.errnum) : -1001;
    this.errorMessage = (e.name ? e.name : "Error")+": "+e.message;
    if (this.currentAction)
        this.errorMessage += ", line: "+this.currentAction.line;

    console.error(this.errorMessage);
    if (this.playing && !this.ignoreErrors) {
        this.stop();
        var features = "titlebar=no,menubar=no,location=no,"+
            "resizable=yes,scrollbars=yes,status=no,"+
            "width=300,height=100";
        var win = window.open("errorDialog.html",
            "iMacros error", features);
        win.args = {
            message: this.errorMessage,
            errorCode: this.errorCode,
            macro: {
                source: this.source,
                name: this.currentMacro
            }
        };
    } else if(this.ignoreErrors) {
        this.next();
    }
};



// form lastPerformance and save STOPWATCH results
MacroPlayer.prototype.saveStopwatchResults = function() {
    // ensure that macro timeout is cleared
    this.globalTimer.stop();

    // save total run time
    this.totalRuntime = this.globalTimer.getElapsedTime();
    // form lastPerformance string

    // make all values look like 00000.000
    var format = function(x) {
        var m = x.toFixed(3).match(/^(\d+)\.(\d{3})/);
        var s = m[1];
        while (s.length < 5)
            s = "0"+s;
        
        return s+"."+m[2];
    };
    
    this.lastPerformance = "Total Runtime="+format(this.totalRuntime)+"[!S!]";
    
    // dump stopwatch values onto console
    if (this.stopwatchResults.length) {
        // "Date: 2009/11/12  Time: 15:32, Macro: test1.iim, Status: OK (1)"
        var now = new Date();
        var d = im_StrHelper.formatDateString("yyyy/dd/mm", now);
        var t = im_StrHelper.formatDateString("hh:nn", now);
        
        // TODO: add __is_windows() check
        // var newline = __is_windows() ? "\r\n" : "\n";
        var newline = "\n";
        var s = "\"Date: "+d+"  Time: "+t+
            ", Macro: "+this.currentMacro+
            ", Status: "+this.errorMessage+" ("+this.errorCode+")\",";
        s += newline;
        for (var i = 0; i < this.stopwatchResults.length; i++) {
            var r = this.stopwatchResults[i];
            s += r.id+","+r.elapsedTime.toFixed(3).toString();
            s += newline;
            this.lastPerformance += r.id+"="+
                format(r.elapsedTime)+"[!S!]";
        }
        // TODO: save to file instead
        console.log("STOPWATCH Results:\n"+s);
    }
};

MacroPlayer.prototype.stop = function() {    // Stop playing
    this.playing = false;

    // clear wait and delay timeout if any
    if (this.delayTimeout) {
        clearTimeout(this.delayTimeout);
    }
    if (this.waitTimeout) {
        clearTimeout(this.waitTimeout);
    }

    // form lastPerformance and save STOPWATCH results
    this.saveStopwatchResults();
    
    // clear user-set variables
    this.vars = new Array(3);
    this.userVars = new Object();
    context.updateState(this.windowId,"idle");
    
    // remove badge text
    chrome.browserAction.setBadgeText({text: ""});
    var panel = context[this.windowId].panelWindow;
    if (panel && !panel.closed)
        panel.setLoopValue(1);
};


// functions to manipulate extraction results
MacroPlayer.prototype.getExtractData = function () {
    return this.extractData;
};

MacroPlayer.prototype.addExtractData = function(str) {
    if ( this.extractData.length ) {
        this.extractData += "[EXTRACT]"+str;
    } else {
        this.extractData = str;
    }
};

MacroPlayer.prototype.clearExtractData = function() {
    this.extractData = "";
};


// Show Popup for extraction
MacroPlayer.prototype.showAndAddExtractData = function(str) {
    this.addExtractData(str);
    if (!this.shouldPopupExtract)
        return;
    console.log("extract data "+str);
};




// This function substitutes all occurrences of
// {{varname}} with the variable value
// Use '#NOVAR#{{' to insert '{{'
// (the function would fail if a variable contains '#novar#{' string)
MacroPlayer.prototype.expandVariables = function(param) {
    // first replace all #NOVAR#{{ by #NOVAR#{
    param = param.replace(/#novar#\{\{/ig, "#NOVAR#{");
    // substitute {{vars}}
    var mplayer = this;
    var handleVariable = function (match_str, var_name) {
        var t = null;
        if ( t = var_name.match(/^!var([123])$/i) ) {
            return mplayer.vars[__int(t[1])];
        } else if ( t = var_name.match(/^!extract$/i) ) {
            return mplayer.getExtractData();
        } else if ( t = var_name.match(/^!urlcurrent$/i) ) {
            return mplayer.currentURL;
        } else if ( t = var_name.match(/^!now:(\S+)$/i) ) {
            return im_StrHelper.formatDateString(t[1]);
        } else if ( t = var_name.match(/^!loop$/i) ) {
            return mplayer.currentLoop;
        }
        // TODO: paste to clipboard not supported
        // http://crbug.com/28941
        // else if ( t = var_name.match(/^!clipboard$/i) ) {
        //     return im_Clipboard.getString() || "";
        // } 
        else if ( t = var_name.match(/^!stopwatchtime$/i) ) {
            // convert to d+\.d{3} format
            var value = mplayer.lastWatchValue.toFixed(3).toString();
            return value;
        } else {                // a user-defined variable
            var value = "__undefined__";
            // TODO: no user variables yet
            // if (mplayer.hasUserVar(var_name))
            //     value = mplayer.getUserVar(var_name);
            return value;
        }
    };
    param = param.replace(/\{\{(\S+?)\}\}/g, handleVariable);
    // substitute all #novar#{ by {{
    param = param.replace(/#novar#\{(?=[^{])/ig, "{{");

    return param;
};
