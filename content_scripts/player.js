/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/


// a pattern to match a double quoted string or a non-whitespace char sequence
const im_strre = "(?:\"(?:[^\"\\\\]+|\\\\[0btnvfr\"\'\\\\])*\"|\\S*)";



var ClickHandler = {
    // check if the point is inside the element
    visibleElement: function(element) {
        return element.offsetWidth && element.offsetHeight;
    },


    withinElement: function(element, x, y) {
        var pos = this.getElementLUCorner(element);
        return (x >= pos.x && x <= pos.x+element.offsetWidth &&
                y >= pos.y && y <= pos.y+element.offsetHeight);

    },

    
    // find an innermost element which containts the point
    getInnermostElement: function(element, x, y) {
        var children = element.childNodes, tmp;

        for (var i = 0; i < children.length; i++) {
            if ( children[i].nodeType != Node.ELEMENT_NODE )
                continue;
            if ( this.visibleElement(children[i]) ) {
                if ( this.withinElement(children[i], x, y) ) {
                    return this.getInnermostElement(children[i], x, y);
                }
            } else {
                if ( children[i].childNodes.length ) {
                    tmp = this.getInnermostElement(children[i], x, y);
                    if ( tmp != children[i] )
                        return tmp;
                }
            }
        }

        return element;
    },


    // find an element specified by the coordinates
    getElementByXY: function (wnd, x, y) {
        // top-level elements
        var nodes = wnd.document.getElementsByTagName("*");
        for (var i = 0; i < nodes.length; i++) {
            if (this.withinElement(nodes[i], x, y)) {
                var element = this.getInnermostElement(nodes[i], x, y);
                if (element.tagName != "FRAME") {
                    return element;
                } else {
                    for (var j = 0; j < wnd.frames.length; j++) {
                        if (wnd.frames[j].frameElement == element) {
                            return this.getElementByXY(wnd.frames[j], x, y);
                        }
                    }
                }
            }
        }
        return null;
    },


    // find element offset relative to its window
    calculateOffset: function(element) {
        var x = 0, y = 0;
        while (element) {
            x += element.offsetLeft;
            y += element.offsetTop;
            element = element.offsetParent;
        }
        return {x: x, y: y};
    },


    // find element position in the current content window
    getElementLUCorner: function (element) {
        var e = element;
        var pos = {x: 0, y: 0};
        while (e) {
            var tpos = this.calculateOffset(e);
            pos.x += tpos.x;
            pos.y += tpos.y;
            e = e.ownerDocument.defaultView.frameElement;
        }
        return pos;
    },

    // find center of an element
    findElementPosition: function(element) {
        var pos = this.getElementLUCorner(element);
        pos.x += Math.round(element.offsetWidth/2);
        pos.y += Math.round(element.offsetHeight/2);
        return pos;
    }

};


// An object to find and process elements specified by TAG command
var TagHandler = {
    // checks if the given node matches the atts
    match: function(node, atts) {
        var match = true;

        for (var at in atts) {
            if (at == "txt") {
                var txt = im_StrHelper.escapeTextContent(node.textContent);
                if (!atts[at].exec(txt)) {
                    match = false; break;
                }
            } else {
                var atval = "", propval = "";
                // first check if the element has the <at> property 
                if (at in node) {
                    propval = node[at];
                } else if (at == "href" && "src" in node) {
                    // special case for old macros
                    // treat 'href' as 'src' 
                    propval = node.src;
                }
                // then check if the element has the <at> attribute
                if (node.hasAttribute(at)) {
                    atval = node.getAttribute(at);
                }
                // applay regexp to the values
                if (!(!!atts[at].exec(propval) || !!atts[at].exec(atval))) {
                    match = false; break;
                }
            } 
        }
        return match;
    },
    
    // find element (relatively) starting from root/lastNode
    // with tagName and atts
    find: function(doc, root, pos, relative, tagName, atts, form_atts) {
        var xpath = "descendant-or-self", ctx = root, nodes = new Array();
        // construct xpath expression to get a set of nodes
        if (relative) {         // is positioning relative?
            xpath = pos > 0 ? "following" : "preceding";
            if (!(ctx = this.lastNode) || ctx.ownerDocument != doc)
                return (this.lastNode = null);
        }
        xpath += "::"+tagName;
        console.log("evaluating xpath "+xpath+" on ctx="+ctx.tagName);
        // evaluate XPath
        var result = doc.evaluate(xpath, ctx, null,
            XPathResult.ORDERED_NODE_ITERATOR_TYPE,
            null);
        var node = null;
        while (node = result.iterateNext()) {
            nodes.push(node);
        }
        
        // Set parameters for the search loop
        var count = 0, i, start, end, increment;
        if (pos > 0) {
            start = 0; end = nodes.length; increment = 1;
        } else if (pos < 0) {
            start = nodes.length-1; end = -1; increment = -1;
        } else {
            throw new BadParameter("POS=<number> or POS=R<number>"+
                                   " where <number> is a non-zero integer", 1);
        }

        // check for NoFormName
        if (form_atts && form_atts["name"] &&
            form_atts["name"].exec("NoFormName"))
            form_atts = null;

        // loop over nodes
        for (i = start; i != end; i += increment) {
            // First check that all atts matches
            // if !atts then match elements with any attributes
            var match = atts ? this.match(nodes[i], atts) : true;
            // then check that the element's form matches form_atts
            if (match && form_atts && nodes[i].form)
                match = this.match(nodes[i].form, form_atts);
            if (match && ++count == Math.abs(pos)) {
                // success! return the node found
                return (this.lastNode = nodes[i]);
            }
        }

        return (this.lastNode = null);
    },



    // find element by XPath starting from root
    findByXPath: function(doc, root, xpath) {
        var nodes = new Array();
        // evaluate XPath
        try {
            var result = doc.evaluate(xpath, root, null,
                                      XPathResult.ORDERED_NODE_ITERATOR_TYPE,
                                      null);
            var node = null;
            while (node = result.iterateNext()) {
                nodes.push(node);
            }
        } catch (e) {
            throw new RuntimeError("incorrect XPath expression: "+xpath, 981);
        }
        if (nodes.length > 1)
            throw new RuntimeError("unambiguous XPath expression: "+xpath, 982);
        if (nodes.length == 1)
            return nodes[0];

        return null;
    },
    

    // Find element's position (for TAG recording)
    findPosition: function(element, atts, form_atts) {
        var xpath = "descendant-or-self::"+element.tagName;
        var doc = element.ownerDocument;
        var ctx = doc.documentElement;
        var nodes = new Array(), count = 0;
        // evaluate XPath
        try {
            var res = doc.evaluate(xpath, ctx, null,
                                   XPathResult.ORDERED_NODE_ITERATOR_TYPE,
                                   null);
            var node = null;
            while (node = res.iterateNext()) {
                nodes.push(node);
            }
        } catch (e) {
            console.log(e.toString());
        }
    
        // check for NoFormName
        if (form_atts && form_atts["name"] &&
            form_atts["name"].exec("NoFormName"))
            form_atts = null;
        
        // loop over nodes
        for (var i = 0; i < nodes.length; i++) {
            // First check that all atts matches
            // if !atts then match elements with any attributes
            var match = atts ? this.match(nodes[i], atts) : true;
            // then check that the element's form matches form_atts
            if (match && form_atts && nodes[i].form)
                match = this.match(nodes[i].form, form_atts);
            if (match) 
                count++;
            if (nodes[i] == element)
                break;
        }

        return count;
    },


    // provides the IE's outerHTML property to handle EXTRACT=HTM
    getOuterHTML: function (node) {
        if (!node)
            return;
        var doc = node.ownerDocument;
        var div = doc.createElement("div");
        div.appendChild(node.cloneNode(true));
        var s = div.innerHTML;
        div.innerHTML = "";
        return s;
    },

    // handles EXTRACT=TXT|TXTALL|HTM|ALT|HREF|TITLE|CHECKED
    onExtractParam: function(tagName, element, extract_type) {
        var tmp = "", i;
        if (/^(txt|txtall)$/i.test(extract_type)) {
            tmp = RegExp.$1.toLowerCase();
            switch (tagName) {
            case "input": case "textarea":
                return element.value;
            case "select":
                if (tmp == "txtall") {
                    var s = new Array(), options = element.options;
                    for (i = 0; i < options.length; i++) {
                        s.push(options[i].text);
                    }
                    return s.join("[OPTION]");
                } else {
                    // only first selected, this may be a bug
                    // there is no clear specs 
                    return element.value;
                }
            case "table":
                tmp = "";
                for ( i = 0; i < element.rows.length; i++) {
                    var row = element.rows[i], ar = new Array();
                    for (var j = 0; j < row.cells.length; j++)
                        ar.push(row.cells[j].textContent);
                    tmp += '"'+ar.join('","')+'"\n';
                }
                return tmp;
            default:
                return element.textContent;
            }
        } else if (/^htm$/i.test(extract_type)) {
            tmp = this.getOuterHTML(element);
            tmp = tmp.replace(/[\t\n\r]/g, " ");
            return tmp;
        } else if (/^href$/i.test(extract_type)) {
            if ("href" in element) 
                return element["href"];
            else if (element.hasAttribute("href"))
                return elem.getAttribute("href");
            else if ("src" in element)
                return element["src"];
            else if (element.hasAttribute("src"))
                return elem.getAttribute("src");
            else
                return "#EANF#";
        } else if (/^(title|alt)$/i.test(extract_type)) {
            tmp = RegExp.$1.toLowerCase();
            if (tmp in element)
                return element[tmp];
            else if (element.hasAttribute(tmp)) 
                return elem.getAttribute(tmp);
            else
                return "#EANF#";
        } else if (/^checked$/i.test(extract_type)) {
            if (!/^(?:checkbox|radio)$/i.test(element.type))
                throw new BadParameter("EXTRACT=CHECKED makes sense"+
                                       " only for check or radio boxes");
            return element.checked ? "YES" : "NO";
        } else {
            throw new BadParameter("EXTRACT=TXT|TXTALL|HTM|"+
                                   "TITLE|ALT|HREF|CHECKED", 5);
        }
    },


    // handles CONTENT=...
    onContentParam: function(tagName, element, content) {
        var tmp;
        // fire "focus" event
        this.htmlFocusEvent(element);
        
        switch (tagName) {
        case "select":
            // <select> element has special content semantic
            // so let the function handle it
            this.handleSelectElement(element, content);
            this.htmlChangeEvent(element);
            break;
        case "input":
            switch(element.type) {
            case "text": case "hidden":
                element.value = content;
                this.htmlChangeEvent(element);
                break;
            case "password":
                this.handlePasswordElement(element, content);
                this.htmlChangeEvent(element);
                break;
            case "checkbox":
                if (/^(?:true|yes|on)$/i.test(content)) {
                    if (!element.checked) 
                        element.click();
                } else {
                    if (element.checked)
                        element.click();
                }
                break;
            case "file":
                element.value = content;
                this.htmlChangeEvent(element);
                break;
            default:
                // click on button-like elements
                this.simulateClick(element);
            }
            break;
        case "button":
            this.simulateClick(element);
            break;
        case "textarea":
            element.value = content;
            this.htmlChangeEvent(element);
            break;
        default:
            // there is not much to do with other elements
            // let's try to click it
            this.simulateClick(element);
        }
        // fire "blur" event
        this.htmlBlurEvent(element);
    },


    // process <select> element
    handleSelectElement: function(element, content) {
        var i, j;
        var opts = content.split(new RegExp(":(?=[%$]"+im_strre+"|\\d+)"));
        var options = element.options;
        element.options.selectedIndex = -1; // remove selection if any
        if (opts.length > 1) // multiple selection
            element.multiple = true;
        for (i = 0; i < opts.length; i++) {
            if (/^(\d+)$/.test(opts[i])) { // index
                var idx = __int(opts[i]);
                if ( idx > element.length )
                    throw new RuntimeError("Selected entry not available:"+
                                           idx+" [Box has "+element.length+
                                           " entries]", 924);
                options[idx-1].selected = true;
            } else if (/^([%$])(.*)$/i.test(opts[i])) { // by text content/value
                var typ = RegExp.$1;
                var val = RegExp.$2;
                val = im_StrHelper.escapeREChars(val);
                val = val.replace(/\*/g, '(?:\n|.)*');
                val = new RegExp("^\\s*"+val+"\\s*$", "i");
                for (j = 0; j < options.length; j++) {
                    var o = options[j];
                    if (val.exec(typ == "$" ? o.textContent : o.value)) {
                        options[j].selected = true;
                        break;
                    }
                }
            } else if (/^all$/i.test(content)) { // select all tags
                for (i = 0; i < options.length; i++)
                    options[i].selected = true;
            } else {
                throw new RuntimeError("Unable to select entry specified by: "+
                                       content, 925);
            }
        }
    },

    // process <input type="password"/> element
    handlePasswordElement: function(element, content) {
        element.value = content;
    },

        
    // simulate mouse click on the element
    simulateClick: function(element) {
        if (typeof(element.click) == "function") {
            console.log("simulateClick: element has 'click' method");
            element.click();
        } else {
            var initEvent = function(e, d, typ) {
                e.initMouseEvent(typ, true, true, d.defaultView, 1, 0, 0, 0, 0,
                                 false, false, false, false, 0, null);
            };
            var stop = function (e) { e.stopPropagation(); };

            var doc = element.ownerDocument, x;
            var events = { "mouseover": null,
                "mousedown": null,
                "mouseup"  : null,
                "click"    : null };

            element.addEventListener("mouseover", stop, false);
            element.addEventListener("mouseout", stop, false);
            
            for (x in events) {
                events[x] = doc.createEvent("MouseEvent");
                initEvent(events[x], doc, x);
                element.dispatchEvent(events[x]);
            }
        }
    },

    // dispatch HTML "change" event to the element
    htmlChangeEvent: function(element) {
        if (!/^(?:input|select|textarea)$/i.test(element.tagName))
            return;
        var evt = element.ownerDocument.createEvent("Event");
        evt.initEvent("change", true, false);
        element.dispatchEvent(evt);
    },

    // dispatch HTML focus event
    htmlFocusEvent: function(element) {
        if (!/^(?:a|area|label|input|select|textarea|button)$/i.
            test(element.tagName))
            return;
        var evt = element.ownerDocument.createEvent("Event");
        evt.initEvent("focus", false, false);
        element.dispatchEvent(evt);
    },

    // dispatch HTML blur event
    htmlBlurEvent: function(element) {
        if (!/^(?:a|area|label|input|select|textarea|button)$/i.
            test(element.tagName))
            return;
        var evt = element.ownerDocument.createEvent("Event");
        evt.initEvent("blur", false, false);
        element.dispatchEvent(evt);
    }

};



var player = {
    registerHandler: function() {
        connector.registerHandler("tag-command",
                                  this.handleTagCommand.bind(this) );
        connector.registerHandler("refresh-command",
                                  this.handleRefreshCommand.bind(this) );
        connector.registerHandler("prompt-command",
                                  this.handlePromptCommand.bind(this) );
    },

    handleRefreshCommand: function(args) {
        window.location.reload();
    },

    handlePromptCommand: function(args) {
        var retobj = {varnum: args.varnum};
        if (args.varnum) {
            // TODO: check if input was cancelled
            retobj.value = prompt(args.text, args.defval);
        } else {
            alert(args.text);
        }
        connector.postMessage("prompt-command-complete", retobj);
    },

    handleTagCommand: function( args ) {
        var doc = window.document;
        var root = doc.documentElement;
        var element;

        var retobj = {
            found: false,       // element found
            extract: "",        // extract string if any
            error: null         // error message or code
        };
        console.log("playing tag comand args="+__obj2str(args)+
                    " on page="+window.location.toString());
        try {
            // compile regexps for atts and form
            if (args.atts)
                for (var x in args.atts) 
                    args.atts[x] = new RegExp(args.atts[x]);
            if (args.form)
                for (var x in args.form) 
                    args.form[x] = new RegExp(args.form[x]);

            if ( args.xpath )
                element = TagHandler.findByXPath(doc, root, args.xpath);
            else 
                element = TagHandler.find(doc, root, args.pos, args.relative,
                                          args.tagName, args.atts, args.form);
            if (!element) {
                var msg = "element "+args.tagName.toUpperCase()+
                    " specified by "+args.atts_str+
                    " was not found";
                console.log(msg);
                if (args.type == "extract") {
                    retobj.extract = "#EANF#";
                } else {
                    retobj.error = new
                       RuntimeError(msg);
                }
                connector.postMessage("tag-command-complete", retobj);
                return;
            }
            retobj.found = true;

            // scroll to the element
            if (args.scroll) {
                var pos = ClickHandler.findElementPosition(element);
                window.scrollTo(pos.x-100, pos.y-100);
            }

            // make it blue
            if (args.highlight) {
                element.style.borderColor = "#0000ff";
                element.style.borderWidth = "2px";
                element.style.borderStyle = "solid";
            }

            if (args.tagName == "*" || args.tagName == "")
                args.tagName = element.tagName.toLowerCase();
            // extract
            if (args.type == "extract") {
                retobj.extract =
                    TagHandler.onExtractParam(args.tagName, element, args.txt);
            } else if (args.type == "content") {
                if (/^event:(\S*)$/i.test(args.txt)) {
                    var etype = RegExp.$1.toLowerCase();
                    switch(etype) {
                    case "saveitem": case "savepictureas":
                    case "savetargetas": case "savetarget":
                        retobj.error = "Event type "+etype+" not supported";
                        break;
                    case "mouseover":
                        var evt = doc.createEvent("MouseEvent");
                        evt.initMouseEvent("mouseover", true, true,
                                           doc.defaultView, 0, 0, 0, 0, 0,
                                           false, false, false, false, 0, null);
                        element.dispatchEvent(evt);
                        break;
                    case "fail_if_found":
                        retobj.error = "FAIL_IF_FOUND event";
                        break;
                    default:
                        retobj.error = "unknown event type for tag command: "+
                            etype;
                    }
                } else {
                    TagHandler.onContentParam(args.tagName, element, args.txt);
                }
            } else {
                TagHandler.onContentParam(args.tagName, element);
            }
        } catch (e) {
            retobj.error = e;
            console.log(retobj.error.toString());
        } finally {
            connector.postMessage("tag-command-complete", retobj);
        }
    }
};


(function () {
    if (window.top != self)
        return;
    player.registerHandler();
})();

