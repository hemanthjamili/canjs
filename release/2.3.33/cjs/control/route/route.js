/*!
 * CanJS - 2.3.32
 * http://canjs.com/
 * Copyright (c) 2017 Bitovi
 * Mon, 02 Oct 2017 16:48:35 GMT
 * Licensed MIT
 */

/*can@2.3.32#control/route/route*/
var can = require('../../util/util.js');
require('../../route/route.js');
require('../control.js');
can.Control.processors.route = function (el, event, selector, funcName, controller) {
    selector = selector || '';
    if (!can.route.routes[selector]) {
        if (selector[0] === '/') {
            selector = selector.substring(1);
        }
        can.route(selector);
    }
    var batchNum, check = function (ev, attr, how) {
            if (can.route.attr('route') === selector && (ev.batchNum === undefined || ev.batchNum !== batchNum)) {
                batchNum = ev.batchNum;
                var d = can.route.attr();
                delete d.route;
                if (can.isFunction(controller[funcName])) {
                    controller[funcName](d);
                } else {
                    controller[controller[funcName]](d);
                }
            }
        };
    can.route.bind('change', check);
    return function () {
        can.route.unbind('change', check);
    };
};
module.exports = can;