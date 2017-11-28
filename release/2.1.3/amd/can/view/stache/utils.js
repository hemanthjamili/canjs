/*!
 * CanJS - 2.1.3
 * http://canjs.us/
 * Copyright (c) 2014 Bitovi
 * Mon, 25 Aug 2014 21:51:29 GMT
 * Licensed MIT
 * Includes: CanJS default build
 * Download from: http://canjs.us/
 */
define(["can/util/library"], function(){
	return {
		// Returns if something looks like an array.  This works for can.List
		isArrayLike: function (obj) {
			return obj && obj.splice && typeof obj.length === 'number';
		},
		// Returns if something is an observe.  This works for can.route
		isObserveLike: function (obj) {
			return obj instanceof can.Map || (obj && !! obj._get);
		},
		// A generic empty function
		emptyHandler: function(){},
		// Converts a string like "1" into 1. "null" into null, etc.
		// This doesn't have to do full JSON, so removing eval would be good.
		jsonParse: function(str){
			// if it starts with a quote, assume a string.
			if(str[0] === "'") {
				return str.substr(1, str.length -2);
			} else if(str === "undefined") {
				return undefined;
			} else if(window.JSON) {
				return JSON.parse(str);
			} else {
				return eval("("+str+")");
			}
		},
		mixins: {
			last: function(){
				return this.stack[this.stack.length - 1];
			},
			add: function(chars){
				this.last().add(chars);
			},
			subSectionDepth: function(){
				return this.stack.length - 1;
			}
		}
	};
});