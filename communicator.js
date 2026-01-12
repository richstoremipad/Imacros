/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/


// incapsulates all content scripts-extensions communications
function Communicator() {
    this.ports = new Object();
    this.callbacks = new Object();
    this.addListeners();
}

// add listener for extension events
Communicator.prototype.addListeners = function() {
    // listen to ports creation from content-scripts
    chrome.extension.onConnect.addListener(function(port) {
        var tab_id;
        if (port.sender && port.sender.tab.id) {
            tab_id = port.sender.tab.id;
            // console.info("Connect from content script, sender: "+
            //              port.sender.id+", tab: "+port.sender.tab.id);
        } else if (port.tab && port.tab.id) {
            tab_id = port.tab.id;
            // console.info("Connect from content script, tab: "+port.tab.id);
        } else {
            console.error("onConnect handler error: no tab_id, port:");
            console.dir(port);
            return;
        }
        communicator.ports[tab_id] = port;
        port.onMessage.addListener(function(msg) {
            communicator.handleMessage(msg, tab_id);
        });
    });
    
    chrome.tabs.onRemoved.addListener(function(tab_id) {
        // remove port on tab close
        delete communicator.ports[tab_id];
    });
};

// register handlers for specific content script messages
Communicator.prototype.registerHandler = function(topic, callback, win_id) {
    if (!(topic in this.callbacks))
        this.callbacks[topic] = new Array();
    this.callbacks[topic].push({callback: callback, win_id: win_id});
};

Communicator.prototype.unregisterHandler = function(topic, callback) {
    if (!(topic in this.callbacks))
        return;
    for (var i = 0; i < this.callbacks[topic].length; i++) {
        if (this.callbacks[topic][i].callback == callback) {
            this.callbacks[topic].splice(i, 1);
            break;
        }
    }
};

// handle message from script
Communicator.prototype.handleMessage = function(msg, tab_id) {
    if (msg.topic in this.callbacks) {
        chrome.tabs.get(tab_id, function(tab) {
            communicator.callbacks[msg.topic].forEach( function(x) {
                if (x.win_id && x.win_id == tab.windowId) {
                    // if win_id is set then call callback only if
                    // it is set for the win_id the message came from
                    x.callback(msg.data, tab_id);
                } else {
                    // otherwise ignore message origin's windowId
                    x.callback(msg.data, tab_id);
                }
            });
        });
    } else {
        console.warn("Communicator: unknown topic "+msg.topic);
    }
}


// send message to specific tab
Communicator.prototype.postMessage = function(topic, data, tab_id) {
    if (tab_id in this.ports) {
        this.ports[tab_id].postMessage({topic: topic, data: data});
    } else {
        throw new RuntimeError("no port for tab "+tab_id);
    }
};

// broadcast message
Communicator.prototype.broadcastMessage = function(topic, data, win_id) {
    if (win_id) {
        chrome.tabs.getAllInWindow(win_id, function(tabs) {
            tabs.forEach( function(tab) {
                if (tab.id in communicator.ports)
                    communicator.ports[tab.id].postMessage(
                        {topic: topic, data: data}
                    );
            });
        });
    } else {
        for (var x in this.ports)
            this.ports[x].postMessage({topic: topic, data: data});
    }
};

var communicator = new Communicator();
