/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/



window.addEventListener("load", function (event) {
    TreeView.build();
    ContextMenu.init();

    chrome.bookmarks.onChanged.addListener( function (id, x) {
        // TODO: listen to only iMacros descendants change
        window.location.reload();
    });
    chrome.bookmarks.onChildrenReordered.addListener( function (id, x) {
        // TODO: listen to only iMacros descendants change
        window.location.reload();
    });
    chrome.bookmarks.onCreated.addListener( function (id, x) {
        // TODO: listen to only iMacros descendants change
        window.location.reload();
    });
    chrome.bookmarks.onMoved.addListener( function (id, x) {
        // TODO: listen to only iMacros descendants change
        window.location.reload();
    });
    chrome.bookmarks.onRemoved.addListener( function (id, x) {
        // TODO: listen to only iMacros descendants change
        window.location.reload();
    });
    checkMacroSelected();
}, true);


var TreeView = {
    // build tree from iMacros bookmarks folder
    build: function () {
        chrome.bookmarks.getTree( function (tree) {
            // first find iMacros subtree or create if not found
            // (code duplicates one in addToBookmarks(),
            // TODO: do something with that)
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
                chrome.bookmarks.create(
                    {
                        parentId: bookmarksPanelId,
                        title: "iMacros"
                    },
                    function (folder) {
                        iMacrosFolderId = folder.id;
                        TreeView.buildSubTree(iMacrosFolderId);
                    }
                );
            } else {
                TreeView.buildSubTree(iMacrosFolderId);
            }
        });
    },

    // macro tree builder
    buildSubTree: function (id, parent) {
        if (!parent)
            parent = $("tree");

        chrome.bookmarks.get(id, function (treeNodes) {
            var x = treeNodes[0];
            var span = document.createElement("span");
            var li = document.createElement("li");
            span.className = "bullet";
            li.appendChild(span);
            parent.appendChild(li);
            
            if (!x.url) {           // if x is folder
                li.className = parent.id == "tree" ?
                    "folderOpen" : "folderClosed";
                var ul = document.createElement("ul");
                li.appendChild(ul);
                span.onclick = TreeView.onFolderClick.bind(TreeView);
                span.addEventListener(
                    "mousedown",
                    TreeView.onFolderMouseDown.bind(TreeView)
                );
                span.innerHTML = x.title;
                span.setAttribute("bookmark_id", x.id);
                chrome.bookmarks.getChildren(x.id, function( children ) {
                    children.forEach( function (y) {
                        TreeView.buildSubTree(y.id, ul);
                    });
                });
            } else {                // x is macro
                li.className = "macro";
                var a = document.createElement("a");
                a.href = x.url;
                a.innerHTML = x.title;
                a.addEventListener("click", function(evt) {
                    TreeView.selectItem(evt.target);
                }, true);

                a.addEventListener("dblclick", function(evt) {
                    setTimeout(function() { window.top.play(); }, 200);
                }, true);
                a.setAttribute("bookmark_id", x.id);

                span.appendChild(a);
            }
        });
    },

    onFolderClick: function(event) {
        var el = event.target;
        el.parentNode.className =
            (el.parentNode.className == nodeOpenClass) ?
            nodeClosedClass : nodeOpenClass;
        return false;
    },

    onFolderMouseDown: function(event) {
        this.selectedItem = {
            element: event.target,
            li: event.target.parentNode,
            type: "folder"
        };
    },

    selectItem: function (element) {
        try {                
            // evaluate XPath to find all elements
            // with attribute selected="true"
            var xpath = "id('tree')//a[@selected='true']";
            var result = document.evaluate(xpath, document, null,
                XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
            var node = null;
            while (node = result.iterateNext()) {
                // remove selection
                node.removeAttribute("selected");
            }
        } catch (e) {
            console.error(e.toString());
        }
        
        element.setAttribute("selected", true);
        this.selectedItem = {
            element: element,
            li: element.parentNode.parentNode,
            type: "macro"
        };
        $("imacros-bookmark-div").setAttribute(
            "bookmark_id", element.getAttribute("bookmark_id")
        );
        
        checkMacroSelected();
    }
};





// simulate left mouse click on element
// TODO: code duplicates method in content_script/player.js
function simulateClick(element) {
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
}

function checkMacroSelected() {
    var count = 0;
    try {                
        // evaluate XPath to calculate all elements
        // with attribute selected="true"
        var xpath = "count(id('tree')//a[@selected='true'])";
        count = document.evaluate(xpath, document, null,
            XPathResult.NUMBER_TYPE, null);
        count = count.numberValue;
    } catch (e) {
        console.log(e.toString());
    }
    window.top.onSelectionChanged(count != 0);
}


// context menu handler
var ContextMenu = {
    mouseover: false,
    init: function() {
        this.menu = $("context-menu");
        this.onMouseOver = function(e) { this.mouseOverContext = true };
        this.onMouseOut = function(e) { this.mouseOverContext = false };
        this.menu.addEventListener("mouseover", this.onMouseOver.bind(this));
        this.menu.addEventListener("mouseout", this.onMouseOut.bind(this));
        document.body.onmousedown = this.onMouseDown.bind(this);
        document.body.oncontextmenu = this.onContextMenu.bind(this);
    },

    onMouseDown: function(event) {
        if (this.mouseOverContext)
            return;
        var target = event.target;
        var applicable = /^(span|a)$/i.test(target.tagName);
        if (event.button == 2 && applicable) {
            this.adjustMenu(event.target, RegExp.$1.toLowerCase());
            this.showContext = true;
        } else if (!this.mouseOverContext) {
            this.menu.style.display = "none";
        }
    },

    onContextMenu: function(event) {
        if (!this.showContext)
            return false;
        
        this.menu.style.display = "none";
        this.menu.style.display = "block";
        // calculate context menu position
        var maxLeft = document.body.clientWidth;
        var contextLeft = event.clientX+document.body.scrollLeft-10;
        if (contextLeft+this.menu.offsetWidth+10 > maxLeft)
            contextLeft = maxLeft-this.menu.offsetWidth-10;
        
        var maxTop = document.body.clientHeight;
        var contextTop = event.clientY+document.body.scrollTop-10;
        if (contextTop+this.menu.offsetHeight > maxTop)
            contextTop = maxTop-this.menu.offsetHeight;
        
        this.menu.style.left = contextLeft.toString()+"px";
        this.menu.style.top = contextTop.toString()+"px";
        
        this.showContext = false;
        
        return false;
    },

    adjustMenu: function(element, type) {
        if (type == "a") {
            $("context-edit").style.display = "block";
            simulateClick(element);
        } else if (type == "span") {
            $("context-edit").style.display = "none";
        }
    },

    edit: function() {
        this.hide();
        window.top.edit();
    },

    
    rename: function() {
        this.hide();
        var item = TreeView.selectedItem;
        if (!item) {
            alert("Error: no item selected");
            return;
        }
        var bookmark_id = item.element.getAttribute("bookmark_id");
        var old_name = item.element.textContent;
        var new_name = prompt("Enter new name", old_name);
        if (item.type == "folder") {
            chrome.bookmarks.update(bookmark_id, {title: new_name});
        } else if(item.type == "macro") {
            chrome.bookmarks.get(bookmark_id, function (x) {
                var index = x[0].index;
                var parentId = x[0].parentId;
                var url = x[0].url;
                // change macro name in URL
                try {
                    var m = url.match(/, n = \"([^\"]+)\";/);
                    url = url.replace(/, n = \"[^\"]+\";/,
                        ", n = \""+encodeURIComponent(new_name)+"\";"
                    );
                } catch (e) {
                    console.error(e);
                }
                chrome.bookmarks.remove(bookmark_id, function () {
                    chrome.bookmarks.create(
                        {
                            parentId: parentId,
                            title: new_name,
                            index: index,
                            url: url
                        },
                        function() {}
                    );
                });
            });
        }
    },

    remove: function() {
        this.hide();
        var item = TreeView.selectedItem;
        if (!item) {
            alert("Error: no item selected");
            return;
        }
        var bookmark_id = item.element.getAttribute("bookmark_id");
        if (!bookmark_id) {
            alert("Can not delete "+item.type+" "+item.element.textContent);
            return;
        }

        if (item.type == "macro") {
            chrome.bookmarks.remove(bookmark_id, function () {
                TreeView.selectedItem = null;
            });
        } else if (item.type == "folder") {
            var yes = confirm("Are you sure you want to remove folder "+
                              item.element.textContent+
                              " and all its contents?");
            if (yes)
                chrome.bookmarks.removeTree(bookmark_id, function() {
                    TreeView.selectedItem = null;
                });
        }
    },

    hide: function() {
        this.showContext = false;
        this.menu.style.display = "none";
    }
};
