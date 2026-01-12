/*
(c) Copyright 2009 iOpus Software GmbH - http://www.iopus.com
*/



function Connector() {
    this.callbacks = new Object();
    this.port = chrome.extension.connect();
    this.port.onMessage.addListener(this.handleMessage.bind(this));
}


// handle incoming messages
Connector.prototype.handleMessage = function(msg) {
    console.log("handle message: ");
    console.dir(msg);
    if (msg.topic in this.callbacks)
        this.callbacks[msg.topic].forEach( function(callback) {
            callback(msg.data);
        });
};


// register handlers for specific messages
// callback's prototype is function(msg)
Connector.prototype.registerHandler = function(topic, callback) {
    if (!(topic in this.callbacks))
        this.callbacks[topic] = new Array();
    this.callbacks[topic].push(callback);
};


// remove specified handler
Connector.prototype.unregisterHandler = function(topic, callback) {
    var i = this.callbacks[topic].indexOf(callback);
    if ( i != -1 )
        this.callbacks[topic].splice(i, 1);
};



// post message to extension script
Connector.prototype.postMessage = function(topic, data) {
    console.log("cs posting data on topic "+topic+":");
    console.dir(data);
    this.port.postMessage({topic: topic, data: data});
};

var connector = null;

(function () {
    if (window.top == self) 
        connector = new Connector();
})();
