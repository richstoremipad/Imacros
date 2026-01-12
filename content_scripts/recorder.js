/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/

function debug(msg) {
    connector.postMessage("cs-debug", {message: msg});
}

function CSRecorder() {
    connector.registerHandler("start-recording",
                              this.onStartRecording.bind(this));
    connector.registerHandler("stop-recording",
                              this.onStopRecording.bind(this));
    connector.registerHandler("current-state",
                              this.onCurrentState.bind(this));
    connector.postMessage("query-state", {});
}


CSRecorder.prototype.saveAction = function(str) {
    connector.postMessage("record-action", {action: str});
};


CSRecorder.prototype.onStopRecording = function(data) {
    if (this.recording)
        this.stop();
};

CSRecorder.prototype.onStartRecording = function(data) {
    this.currentFrameNumber = data.frameNumber;
    this.start();
};


CSRecorder.prototype.onCurrentState = function(data) {
    // force recording after page load
    if (data.state == "recording" && !this.recording) {
        this.currentFrameNumber = data.frameNumber;
        this.start();
    }
};


CSRecorder.prototype.start = function() {
    this.onChangeEvent = this.onChange.bind(this);
    this.onClickEvent = this.onClick.bind(this);
    this.onMouseOverEvent = this.onMouseOver.bind(this);
    this.onMouseDownEvent = this.onMouseDown.bind(this);

    var attachListeners = function(win) {
        win.addEventListener("change", recorder.onChangeEvent, true);
        win.addEventListener("click", recorder.onClickEvent, true);
        win.addEventListener("mouseover", recorder.onMouseOverEvent, true);
        win.addEventListener("mousedown", recorder.onMouseDownEvent, true);

        // TODO: remove comments when
        // http://crbug/20773 is fixed
        // for (var x = 0; x < win.frames.length; x++) {
        //     attachListeners(win.frames[x]);
        // }
    };

    attachListeners(window);
    this.recording = true;
};


CSRecorder.prototype.stop = function() {
    window.removeEventListener("change", this.onChangeEvent, true);
    window.removeEventListener("click", this.onClickEvent, true);
    window.removeEventListener("mouseover", this.onMouseOverEvent, true);
    window.removeEventListener("mousedown", this.onMouseDownEvent, true);
    this.recording = false;
};




CSRecorder.prototype.findFrameNumber = function (win, f, obj) {
    // TODO: remove comments when
    // http://code.google.com/p/chromium/issues/detail?id=20773
    // is fixed
    return 0;
    // if (win.top == f)         // it is a topmost window
    //     return 0;
    // for (var i = 0; i < win.frames.length; i++) {
    //     obj.num++;
    //     if ( win.frames[i] == f) {
    //         return obj.num;
    //     }
    //     var n = this.findFrameNumber(win.frames[i], f, obj);
    //     if (n != -1)
    //         return n;
    // }
    // return -1;
}


// helper function to parse ATTR=... string
CSRecorder.prototype.parseAtts = function(str) {
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
            val = im_StrHelper.unwrapLine(m[2]);
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
    for (var x in parsed_atts) 
        parsed_atts[x] = new RegExp(parsed_atts[x]);

    return parsed_atts;
};
    

CSRecorder.prototype.onChange = function(e) {
    try {
        var elem = e.target;
        var tagName = elem.tagName;

        // debug("onChange, element="+elem.tagName+
        //       ", url="+window.location.toString());
        
        if (!/^(?:input|textarea|select)$/i.test(tagName))
            return;

        if (/^input$/i.test(tagName) &&
            !/^(?:text|password|checkbox|file)$/i.test(elem.type))
            return;

        var rec = "TAG", type = "" , pos = 0, form = null,
            attr = "", content = "";
        
        var win = elem.ownerDocument.defaultView;
        var nframe = this.findFrameNumber(win.top, win, {num:0});
        if (nframe != this.currentFrameNumber) {
            this.currentFrameNumber = nframe;
            var rec = "FRAME F="+nframe.toString();
            this.saveAction(rec);
        }

        // TYPE
        type = tagName;

        // CONTENT
        switch (tagName) {
        case "INPUT":
            type += ":"+elem.type.toUpperCase();
            if (/^(?:text|file)$/.test(elem.type)) {
                content = im_StrHelper.wrapLine(elem.value);
            } else if (elem.type == "password") {
                // password will be handled in mrecorder
                // no special handling here
                content = im_StrHelper.wrapLine(elem.value);
            } else if (elem.type == "checkbox") {
                content = elem.checked ? "YES" : "NO";
            } 
            break;
        case "SELECT":
            for(var i=0; i < elem.length; i++) {
                var prefix, text;
                if(!elem[i].selected)
                    continue;
                
                if (elem[i].value) {
                    prefix = "%";
                    text = elem[i].value;
                } else {
                    prefix = "$";
                    text = escapeTextContent(elem[i].textContent);
                }
                if (!content) 
                    content = prefix + im_StrHelper.wrapLine(text);
                else
                    content += ":" + prefix + im_StrHelper.wrapLine(text);
            }
            break;
        case "TEXTAREA":
            content = im_StrHelper.wrapLine(elem.value);
            break;
        default:
            return;
        }

        // FORM
        if (elem.form) {
            if (elem.form.id)
                form = "ID:"+im_StrHelper.wrapLine(elem.form.id);
            if (elem.form.name)
                form = "NAME:"+im_StrHelper.wrapLine(elem.form.name);
            else if (elem.form.action)
                form = "ACTION:"+im_StrHelper.wrapLine(elem.form.action);
            else
                form = "NAME:NoFormName";
        }
        // ATTR
        if (elem.id) 
            attr = "ID:"+im_StrHelper.wrapLine(elem.id);
        else if (elem.name)
            attr = "NAME:"+im_StrHelper.wrapLine(elem.name);
        else
            attr = "*";

        // POS
        var atts = this.parseAtts(attr), m;

        // special handling of INPUT elements
        if (/input/i.test(tagName)) { 
            if (!atts) atts = new Object();
            atts["type"] = new RegExp("^"+elem.type+"$");
        }
        
        var form_atts = form ? this.parseAtts(form) : null;
        if (!(pos = TagHandler.findPosition(elem, atts, form_atts))) {
            // TODO: add appropriate error handling
            console.log("Can't find element position, atts="+ atts.toSource());
            return;
        }
        
        // form new record
        rec = "TAG";
        rec += " POS="+pos;
        rec += " TYPE="+type;
        rec += form ? " FORM="+form : "";
        rec += " ATTR="+attr;
        rec += " CONTENT="+content;
        this.saveAction(rec);
    } catch(e) {
        console.log(e.toString());
    }
};


CSRecorder.prototype.onClick = function(e) {
    var elem = e.target;
    if (e.button != 0) {
        return;                 // record only left mouse click
    }
    
    var tagName = elem.tagName.toUpperCase();

    // debug("onClick, element="+elem.tagName+
    //       ", url="+window.location.toString());
    
    if (/^(?:select|option|textarea|form|html|body)$/i.test(tagName))
        return;
    else if (/^input$/i.test(tagName) &&
             !/^(?:button|submit|radio|image)$/i.test(elem.type))
        return;


    var win = elem.ownerDocument.defaultView;
    var nframe = this.findFrameNumber(win.top, win, {num:0});
    if (nframe != this.currentFrameNumber) {
        this.currentFrameNumber = nframe;
        var rec = 'FRAME F='+nframe.toString();
        this.saveAction(rec);
    }

    var rec = "TAG", type = "" , pos = 0, form = null,
        attr = "", content = "";
    
    type = tagName;
    if (/^input$/i.test(tagName)) {
        type += ":"+elem.type.toUpperCase();
        if (elem.form) {
            if (elem.form.id)
                form = "ID:"+im_StrHelper.wrapLine(elem.form.id);
            else if (elem.form.name) 
                form = "NAME:"+im_StrHelper.wrapLine(elem.form.name);
            else if (elem.form.action)
                form = "ACTION:"+im_StrHelper.wrapLine(elem.form.action);
            else
                form = "NAME:NoFormName";
        }
        if (elem.id) {
            attr = "ID:"+im_StrHelper.wrapLine(elem.id);
        } else {
            var arr = new Array();
            if (elem.name)
                arr.push("NAME:"+im_StrHelper.wrapLine(elem.name));
            if (elem.value)
                arr.push("VALUE:"+im_StrHelper.wrapLine(elem.value));
            if (elem.src)
                arr.push("SRC:"+im_StrHelper.wrapLine(elem.src));
            attr = arr.length ? arr.join("&&") : "*";
        }
    } else {
        var val = "";
        // for "auto" mode
        if (elem.id)
            val = "ID:"+im_StrHelper.wrapLine(elem.id);
        else if (elem.href) {
            // for links record txt content first
            if (elem.textContent)
                val = "TXT:"+im_StrHelper.wrapLine(
                    im_StrHelper.escapeTextContent(elem.textContent));
            else
                val = "HREF:"+im_StrHelper.wrapLine(elem.href);
        } else if (elem.src)
            val = "SRC:"+im_StrHelper.wrapLine(elem.src);
        else if (elem.name)
            val = "NAME:"+im_StrHelper.wrapLine(elem.name);
        else if (elem.alt)
            val = "ALT:"+im_StrHelper.wrapLine(elem.alt);
        else if (elem.textContent)
            val = "TXT:"+im_StrHelper.wrapLine(
                im_StrHelper.escapeTextContent(elem.textContent));
        
        if (!val) {  //form attr string
            var x = elem.attributes, arr = new Array();
            for (var i = 0; i < x.length; i++) {
                if (/^style$/i.test(x[i].name))
                    continue;
                arr.push(x[i].name.toUpperCase()+":"+
                         im_StrHelper.wrapLine(x[i].value));
            }
            val = arr.length ? arr.join("&&") : "*";
        }
        attr = val;
    }
    // find POS value
    var atts = this.parseAtts(attr);
    // special handling of INPUT elements
    if (/input/i.test(tagName)) { 
        if (!atts) atts = new Object();
        atts["type"] = new RegExp("^"+elem.type+"$");
    }
    var form_atts = form ? this.parseAtts(form) : null;
    if (!(pos = TagHandler.findPosition(elem, atts, form_atts))) {
        // TODO: add appropriate error handling
        console.log("Can't find element position, atts="+atts.toSource());
        return;
    }
    
    // form new record
    rec = "TAG";
    rec += " POS="+pos;
    rec += " TYPE="+type;
    rec += form ? " FORM="+form : "";
    rec += " ATTR="+attr;
    rec += content ? " CONTENT="+content : "";
    this.saveAction(rec);
};


CSRecorder.prototype.onMouseOver = function(e) {
    // do nothing
};


CSRecorder.prototype.onMouseDown = function(e) {
    // highlight object
    var element = e.target;
    element.style.borderColor = "#0000ff";
    element.style.borderWidth = "2px";
    element.style.borderStyle = "solid";
};


var recorder;

// check if we are at top frame
(function () {
    if (window.top == self) 
        recorder = new CSRecorder();
})();
