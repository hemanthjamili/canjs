// # can/view/bindings/bindings.js
//
// This file defines the `can-value` attribute for two-way bindings and the `can-EVENT` attribute
// for in template event bindings. These are usable in any mustache template, but mainly and documented
// for use within can.Component.

steal("can/util", "can/view/stache/expression.js", "can/view/callbacks", "can/control", "can/view/scope", "can/view/href", function (can, expression, viewCallbacks) {
	
	
	var behaviors = {
		// ### behaviors.viewModel
		// Sets up all of an element's data binding attributes to "soon-to-be-created"
		// `viewModel`. 
		// This is primarily used by `can.Component` to ensure that its
		// `viewModel` is initialized with values from the data bindings as quickly as possible.
		// Component could look up the data binding values itself.  However, that lookup
		// would have to be duplicated when the bindings are established.
		// Instead, this uses the `makeDataBinding` helper, which allows creation of the `viewModel`
		// after scope values have been looked up.
		//
		// - `makeViewModel(initialViewModelData)` - a function that returns the `viewModel`.
		// - `initialViewModelData` any initial data that should already be added to the `viewModel`.
		//
		// Returns:
		// - `function` - a function that tears all the bindings down. Component
		// wants all the bindings active so cleanup can be done during a component being removed.
		viewModel: function(el, tagData, makeViewModel, initialViewModelData){
			initialViewModelData = initialViewModelData || {};
			
			var bindingsSemaphore = {},
				viewModel,
				onViewModels = [],
				onTeardowns = {},
				attributeViewModelBindings = can.extend({}, initialViewModelData);
			
			// For each attribute, 
			can.each( can.makeArray(el.attributes), function(node){
				// start the data binding process.
				var res = makeDataBinding(node, el, {
					templateType: tagData.templateType,
					scope: tagData.scope,
					semaphore: bindingsSemaphore,
					getViewModel: function(){
						return viewModel;
					},
					attributeViewModelBindings: attributeViewModelBindings
				});
				
				// For bindings that change the viewModel,
				if(res) {
					// Save the initial value on the viewModel.
					if(res.bindingInfo.parentToChild) {
						initialViewModelData[res.viewModelName] = res.value;
					}
					// Save what needs to happen after the `viewModel` is created.
					onViewModels.push(res.onViewModel);
					// Save how to tear this down.  
					onTeardowns[node.name] = res.onTeardown;
				}
			});
			
			// Create the `viewModel` and call what needs to be happen after
			// the `viewModel` is created.
			viewModel = makeViewModel(initialViewModelData);
			
			for(var i = 0, len = onViewModels.length; i < len; i++) {
				onViewModels[i]();
			}
			
			// Listen to attribute changes and re-initialize
			// the bindings.
			can.bind.call(el, "attributes", function (ev) {
				var attrName = ev.attributeName;
				
				if( onTeardowns[attrName] ) {
					onTeardowns[attrName]();
				}
				
				var res = makeDataBinding({name: attrName, value: el.getAttribute(attrName)}, el, {
					templateType: tagData.templateType,
					scope: tagData.scope,
					semaphore: {},
					getViewModel: function(){
						return viewModel;
					},
					attributeViewModelBindings: attributeViewModelBindings,
					// always update the viewModel accordingly.
					initializeValues: true
				});
				// The viewModel is created, so 
				if(res) {
					res.onViewModel();
					onTeardowns[attrName] = res.onTeardown;
				}
			});
			
			return function(){
				for(var attrName in onTeardowns) {
					onTeardowns[attrName]();
				}
			};
		},
		// ### behaviors.data
		// This is called when an individual data binding attribute is placed on an element.
		// For example `{^value}="name"`.
		data: function(el, attrData){
			if(can.data(can.$(el),"preventDataBindings")){
				return;
			}
			var viewModel = can.viewModel(el);
			
			var res = makeDataBinding({
				name: attrData.attributeName,
				value: el.getAttribute(attrData.attributeName)
			}, el, {
				templateType: attrData.templateType,
				scope: attrData.scope,
				semaphore: {},
				getViewModel: function(){
					return viewModel;
				},
				setupTeardown: true
			});
			if(res) {
				res.onViewModel();
			}
		},
		// ### behaviors.reference
		// Provides the shorthand `*ref` behavior that exports the `viewModel`.
		// For example `{^value}="name"`.
		reference: function(el, attrData) {
			if(el.getAttribute(attrData.attributeName)) {
				console.warn("&reference attributes can only export the view model.");
			}
	
			var name = can.camelize( attrData.attributeName.substr(1).toLowerCase() );
	
			var viewModel = can.viewModel(el);
			var refs = attrData.scope.getRefs();
			refs._context.attr("*"+name, viewModel);
	
		},
		// ### behaviors.event
		// The following section contains code for implementing the can-EVENT attribute.
		// This binds on a wildcard attribute name. Whenever a view is being processed
		// and can-xxx (anything starting with can-), this callback will be run.  Inside, its setting up an event handler
		// that calls a method identified by the value of this attribute.
		event: function(el, data) {
	
			// Get the `event` name and if we are listening to the element or viewModel.
			// The attribute name is the name of the event.
			var attributeName = data.attributeName,
			// The old way of binding is can-X
				legacyBinding = attributeName.indexOf('can-') === 0,
				event = attributeName.indexOf('can-') === 0 ?
					attributeName.substr("can-".length) :
					removeBrackets(attributeName, '(', ')'),
				onBindElement = legacyBinding;
	
			if(event.charAt(0) === "$") {
				event = event.substr(1);
				onBindElement = true;
			}
	
	
			// This is the method that the event will initially trigger. It will look up the method by the string name
			// passed in the attribute and call it.
			var handler = function (ev) {
					var attrVal = el.getAttribute(attributeName);
					if (!attrVal) { return; }
	
					var $el = can.$(el),
						viewModel = can.viewModel($el[0]);
	
					// expression.parse will read the attribute
					// value and parse it identically to how mustache helpers
					// get parsed.
					var expr = expression.parse(removeBrackets(attrVal),{lookupRule: "method", methodRule: "call"});
	
					if(!(expr instanceof expression.Call) && !(expr instanceof expression.Helper)) {
						var defaultArgs = can.map( [data.scope._context, $el].concat(can.makeArray(arguments) ), function(data){
							return new expression.Literal(data);
						});
						expr = new expression.Call(expr, defaultArgs, {} );
					}
	
					// We grab the first item and treat it as a method that
					// we'll call.
					var scopeData = data.scope.read(expr.methodExpr.key, {
						isArgument: true
					});
	
					// We break out early if the first argument isn't available
					// anywhere.
	
					if (!scopeData.value) {
						scopeData = data.scope.read(expr.methodExpr.key, {
							isArgument: true
						});
	
						//!steal-remove-start
						can.dev.warn("can/view/bindings: " + attributeName + " couldn't find method named " + expr.methodExpr.key, {
							element: el,
							scope: data.scope
						});
						//!steal-remove-end
	
						return null;
					}
	
	
	
					// make a scope with these things just under
	
					var localScope = data.scope.add({
						"@element": $el,
						"@event": ev,
						"@viewModel": viewModel,
						"@scope": data.scope,
						"@context": data.scope._context,
	
						"%element": this,
						"$element": $el,
						"%event": ev,
						"%viewModel": viewModel,
						"%scope": data.scope,
						"%context": data.scope._context
					},{
						notContext: true
					});
	
	
					var args = expr.args(localScope, null)(),
						hash = expr.hash(localScope, null)();
	
					if(!can.isEmptyObject(hash)) {
						args.push(hash);
					}
	
					return scopeData.value.apply(scopeData.parent, args);
				};
	
			// This code adds support for special event types, like can-enter="foo". special.enter (or any special[event]) is
			// a function that returns an object containing an event and a handler. These are to be used for binding. For example,
			// when a user adds a can-enter attribute, we'll bind on the keyup event, and the handler performs special logic to
			// determine on keyup if the enter key was pressed.
			if (special[event]) {
				var specialData = special[event](data, el, handler);
				handler = specialData.handler;
				event = specialData.event;
			}
			// Bind the handler defined above to the element we're currently processing and the event name provided in this
			// attribute name (can-click="foo")
			can.bind.call(onBindElement ? el : can.viewModel(el), event, handler);
	
			// Create a handler that will unbind itself and the event when the attribute is removed from the DOM
			var attributesHandler = function(ev) {
				if(ev.attributeName === attributeName && !this.getAttribute(attributeName)) {
	
					can.unbind.call(onBindElement ? el : can.viewModel(el), event, handler);
					can.unbind.call(el, 'attributes', attributesHandler);
				}
			};
			can.bind.call(el, 'attributes', attributesHandler);
		},
		// ### behaviors.value
		// Behavior for the deprecated can-value
		value: function(el, data) {
			var propName = "$value",
				attrValue = can.trim(removeBrackets(el.getAttribute("can-value"))),
				getterSetter;
	
			if (el.nodeName.toLowerCase() === "input" && ( el.type === "checkbox" || el.type === "radio" ) ) {
	
				var property = getComputeFrom.scope(el, data.scope, attrValue, {});
				if (el.type === "checkbox") {
	
					var trueValue = can.attr.has(el, "can-true-value") ? el.getAttribute("can-true-value") : true,
						falseValue = can.attr.has(el, "can-false-value") ? el.getAttribute("can-false-value") : false;
	
					getterSetter = can.compute(function(newValue){
						// jshint eqeqeq: false
						if(arguments.length) {
							property(newValue ? trueValue : falseValue);
						}
						else {
							return property() == trueValue;
						}
					});
				}
				else if(el.type === "radio") {
					// radio is two-way bound to if the property value
					// equals the element value
	
					getterSetter = can.compute(function(newValue){
						// jshint eqeqeq: false
						if(arguments.length) {
							if( newValue ) {
								property(el.value);
							}
						}
						else {
							return property() == el.value;
						}
					});
	
				}
				propName = "$checked";
				attrValue = "getterSetter";
				data.scope = new can.view.Scope({
					getterSetter: getterSetter
				});
			}
			// For contenteditable elements, we instantiate a Content control.
			else if (isContentEditable(el)) {
				propName = "$innerHTML";
			}
	
			makeDataBinding({
				name: "{("+propName+"})",
				value: attrValue
			}, el, {
				templateType: data.templateType,
				scope: data.scope,
				semaphore: {},
				initializeValues: true,
				legacyBindings: true,
				syncChildWithParent: true
			});
	
		}
	};
	
		
	// ## Custom Attributes
	// The following sets up the bindings functions to be called 
	// when called in a template.
	
	// `{}="bar"` data bindings.
	can.view.attr(/^\{[^\}]+\}$/, behaviors.data);

	// `*ref-export` shorthand.
	can.view.attr(/\*[\w\.\-_]+/, behaviors.reference);

	// `(EVENT)` event bindings.
	can.view.attr(/^\([\$?\w\.]+\)$/, behaviors.event);
	
	
	//!steal-remove-start
	function syntaxWarning(el, attrData) {
		can.dev.warn('can/view/bindings/bindings.js: mismatched binding syntax - ' + attrData.attributeName);
	}
	can.view.attr(/^\(.+\}$/, syntaxWarning);
	can.view.attr(/^\{.+\)$/, syntaxWarning);
	can.view.attr(/^\(\{.+\}\)$/, syntaxWarning);
	//!steal-remove-end

	
	// Legacy bindings.
	can.view.attr(/can-[\w\.]+/, behaviors.event);
	can.view.attr("can-value", behaviors.value);
	
	
	// ## makeDataBinding
	// Makes a data binding for a attribute `node`.  If the
	// data binding involves a `viewModel`, an object will be returned
	// that finishes the data binding once a `viewModel` has been created.
	// - `node` - an attribute node or an object with a `name` and `value` property.
	// - `el` - the element this binding belongs on.
	// - `bindingData` - an object with:
	//   - `templateType` - the type of template. Ex: "legacy" for mustache.
	//   - `scope` - the `can.view.Scope`,
	//   - `semaphore` - an object that keeps track of changes in different properties to prevent cycles,
	//   - `getViewModel`  - a function that returns the `viewModel` when called.  This function can be passed around (not called) even if the 
	//                       `viewModel` doesn't exist yet.
	//   - `attributeViewModelBindings` - properties already specified as being a viewModel<->attribute (as opposed to viewModel<->scope) binding.
	var makeDataBinding = function(node, el, bindingData){
		
		var bindingInfo = getBindingInfo(node, bindingData.attributeViewModelBindings, bindingData.templateType);
		if(!bindingInfo) {
			return;
		}
		var parentCompute = getComputeFrom[bindingInfo.parent](el, bindingData.scope, bindingInfo.parentName, bindingData);
		var childCompute = getComputeFrom[bindingInfo.child](el, bindingData.scope, bindingInfo.childName, bindingData);
		var updateParent;
		
		// Only bind to 
		if(bindingInfo.parentToChild){
			
			var updateChild = bind.parentToChild(el, parentCompute, childCompute, bindingData.semaphore, bindingInfo.bindingAttributeName);
		}
		
		var onViewModel = function(){
			if(bindingInfo.childToParent){
				// setup listening on parent and forwarding to viewModel
				updateParent = bind.childToParent(el, parentCompute, childCompute, bindingData.semaphore, bindingInfo.bindingAttributeName,
					bindingData.syncChildWithParent);
			}
			if(bindingData.initializeValues || bindingInfo.initializeValues) {
				initializeValues(bindingInfo, childCompute, parentCompute, updateChild, updateParent);
			}
			
			if(bindingData.setupTeardown) {
				can.one.call(el, 'removed', onTeardown);
			}
		};
		// TODO: onTeardown isn't returned?
		var onTeardown = function() {
			unbindUpdate(parentCompute, updateChild);
			unbindUpdate(childCompute, updateParent);
		};
		if(bindingInfo.child === "viewModel") {
			return {
				value: getValue(parentCompute),
				viewModelName: bindingInfo.childName,
				onViewModel: onViewModel,
				bindingInfo: bindingInfo,
				onTeardown: onTeardown
			};
		} else {
			onViewModel();
		}
	};
	
	// ## getBindingInfo
	// takes a node object like {name, value} and returns
	// an object with information about that binding.
	// Properties:
	// - `parent` - where is the parentName read from: "scope", "attribute", "viewModel".
	// - `parentName` - what is the parent property that should be read.
	// - `child` - where is the childName read from: "scope", "attribute", "viewModel".
	//  - `childName` - what is the child property that should be read.
	// - `parentToChild` - should changes in the parent update the child.
	// - `childToParent` - should changes in the child update the parent.
	// - `bindingAttributeName` - the attribute name that created this binding.
	// - `initializeValues` - should parent and child be initialized to their counterpart.
	// If undefined is return, there is no binding.
	var getBindingInfo = function(node, attributeViewModelBindings, templateType){
		var attributeName = node.name,
			attributeValue = node.value;
		
		// Does this match the new binding syntax?
		var matches = attributeName.match(bindingsRegExp);
		if(!matches) {
			var ignoreAttribute = ignoreAttributesRegExp.test(attributeName);
			var vmName = can.camelize(attributeName);
			
			//!steal-remove-start
			// user tried to pass something like id="{foo}", so give them a good warning
			if(ignoreAttribute) {
				can.dev.warn("can/component: looks like you're trying to pass "+attributeName+" as an attribute into a component, "+
				"but it is not a supported attribute");
			}
			//!steal-remove-end
			
			// if this is handled by another binding or a attribute like `id`.
			if ( ignoreAttribute || viewCallbacks.attr(attributeName) ) {
				return;
			}
			var syntaxRight = attributeValue[0] === "{" && can.last(attributeValue) === "}";
			var isAttributeToChild = templateType === "legacy" ? attributeViewModelBindings[vmName] : !syntaxRight;
			var scopeName = syntaxRight ? attributeValue.substr(1, attributeValue.length - 2 ) : attributeValue;
			if(isAttributeToChild) {
				return {
					bindingAttributeName: attributeName,
					parent: "attribute",
					parentName: attributeName,
					child: "viewModel",
					childName: vmName,
					parentToChild: true,
					childToParent: true
				};
			} else {
				return {
					bindingAttributeName: attributeName,
					parent: "scope",
					parentName: scopeName,
					child: "viewModel",
					childName: vmName,
					parentToChild: true,
					childToParent: true
				};
			}
		}
		
		var twoWay = !!matches[1],
			childToParent = twoWay || !!matches[2],
			parentToChild = twoWay || !childToParent;
		
		var childName = matches[3];
		var isDOM = childName.charAt(0) === "$";
		if(isDOM) {
			
			return {
				parent: "scope",
				child: "attribute",
				childToParent: childToParent,
				parentToChild: parentToChild,
				bindingAttributeName: attributeName,
				childName: childName.substr(1),
				parentName: attributeValue,
				initializeValues: true
			};
		} else {
			return {
				parent: "scope",
				child: "viewModel",
				childToParent: childToParent,
				parentToChild: parentToChild,
				bindingAttributeName: attributeName,
				childName: can.camelize(childName),
				parentName: attributeValue,
				initializeValues: true
			};
		}

	};
	// Regular expressions for getBindingInfo
	var bindingsRegExp = /\{(\()?(\^)?([^\}\)]+)\)?\}/,
		ignoreAttributesRegExp = /^(data-view-id|class|id|\[[\w\.-]+\]|#[\w\.-])$/i;
	
	
	// ## getComputeFrom
	// An object of helper functions that make a getter/setter compute
	// on different types of objects.
	var getComputeFrom = {
		scope: function(el, scope, scopeProp, options){
			var parentExpression = expression.parse(scopeProp,{baseMethodType: "Call"});
			return parentExpression.value(scope, new can.view.Scope());
		},
		viewModel: function(el, scope, vmName, options) {
			return can.compute(function(newVal){
				var viewModel = options.getViewModel();
				if(arguments.length) {
					viewModel.attr(vmName,newVal);
				} else {
					return vmName === "." ? viewModel : can.compute.read(viewModel, can.compute.read.reads(vmName), {}).value;
				}
				
			});
		},
		attribute: function(el, scope, prop, options, event){
			if(!event) {
				if(prop === "innerHTML") {
					event = ["blur","change"];
				}
				else {
					event = "change";
				}
			}
			if(!can.isArray(event)) {
				event = [event];
			}
	
			var hasChildren = el.nodeName.toLowerCase() === "select",
				isMultiselectValue = prop === "value" && hasChildren && el.multiple,
				isStringValue,
				lastSet,
				scheduledAsyncSet = false,
				set = function(newVal){
					// Templates write parent's out before children.  This should probably change.
					// But it means we don't do a set immediately.
					if(hasChildren && !scheduledAsyncSet) {
						scheduledAsyncSet = true;
						setTimeout(function(){
							set(newVal);
						},1);
					}
					
					lastSet = newVal;
					if(isMultiselectValue) {
						if (newVal && typeof newVal === 'string') {
							newVal = newVal.split(";");
							isStringValue = true;
						}
						// When given something else, try to make it an array and deal with it
						else if (newVal) {
							newVal = can.makeArray(newVal);
						} else {
							newVal = [];
						}
	
						// Make an object containing all the options passed in for convenient lookup
						var isSelected = {};
						can.each(newVal, function (val) {
							isSelected[val] = true;
						});
	
						// Go through each &lt;option/&gt; element, if it has a value property (its a valid option), then
						// set its selected property if it was in the list of vals that were just set.
						can.each(el.childNodes, function (option) {
							if (option.value) {
								option.selected = !! isSelected[option.value];
							}
						});
					} else {
						if(!options.legacyBindings && hasChildren && ("selectedIndex" in el)) {
							el.selectedIndex = -1;
						}
						can.attr.setAttrOrProp(el, prop, newVal == null ? "" : newVal);
					}
					return newVal;
	
				},
				get = function(){
					if(isMultiselectValue) {
	
						var values = [],
							children = el.childNodes;
	
						can.each(children, function (child) {
							if (child.selected && child.value) {
								values.push(child.value);
							}
						});
	
						return isStringValue ? values.join(";"): values;
					}
	
					return can.attr.get(el, prop);
				};
			
			// Parent is hydrated before children.  So we do
			// a tiny wait to do any sets.
			if(hasChildren) {
				// have to set later ... probably only with mustache.
				setTimeout(function(){
					scheduledAsyncSet = true;
				},1);
			}
	
			return can.compute(get(),{
				on: function(updater){
					can.each(event, function(eventName){
						can.bind.call(el,eventName, updater);
					});
				},
				off: function(updater){
					can.each(event, function(eventName){
						can.unbind.call(el,eventName, updater);
					});
				},
				get: get,
				set: set
			});
		}
	};
	
	// ## bind
	// An object with helpers that perform bindings in a certain direction.  
	// These use the semaphore to prevent cycles.
	var bind = {
		// child -> parent binding
		// el -> the element
		// parentUpdate -> a method that updates the parent
		childToParent: function(el, parentUpdate, childCompute, bindingsSemaphore, attrName, syncChild){
			var parentUpdateIsFunction = typeof parentUpdate === "function";
	
			var updateScope = function(ev, newVal){
				if (!bindingsSemaphore[attrName]) {
					if(parentUpdateIsFunction) {
						parentUpdate(newVal);
						if( syncChild ) {
							if(parentUpdate() !== childCompute()) {
								bindingsSemaphore[attrName] = (bindingsSemaphore[attrName] || 0 )+1;
								childCompute(parentUpdate());
								can.batch.after(function(){
									--bindingsSemaphore[attrName];
								});
							}
						}
					} else if(parentUpdate instanceof can.Map) {
						parentUpdate.attr(newVal, true);
					}
				}
			};
	
			if(childCompute && childCompute.isComputed) {
				childCompute.bind("change", updateScope);
			}
	
			return updateScope;
		},
		// parent -> child binding
		parentToChild: function(el, parentCompute, childUpdate, bindingsSemaphore, attrName){
	
			// setup listening on parent and forwarding to viewModel
			var updateChild = function(ev, newValue){
				// Save the viewModel property name so it is not updated multiple times.
				bindingsSemaphore[attrName] = (bindingsSemaphore[attrName] || 0 )+1;
				childUpdate(newValue);
	
				// only after the batch has finished, reduce the update counter
				can.batch.after(function(){
					--bindingsSemaphore[attrName];
				});
			};
	
			if(parentCompute && parentCompute.isComputed) {
				parentCompute.bind("change", updateChild);
			}
	
			return updateChild;
		}
	};
	
	// ## initializeValues
	var initializeValues = function(options, childCompute, parentCompute, updateChild, updateScope){

		if(options.parentToChild && !options.childToParent) {
			updateChild({}, getValue(parentCompute) );
		}
		else if(!options.parentToChild && options.childToParent) {
			updateScope({}, getValue(childCompute) );
		}
		// Two way
		// Update child or parent depending on who has a value.
		// If both have a value, update the child.
		else if( getValue(childCompute) === undefined) {
			updateChild({}, getValue(parentCompute) );
		} else if(getValue(parentCompute) === undefined) {
			updateScope({}, getValue(childCompute) );
		} else {
			updateChild({}, getValue(parentCompute) );
		}
	};
	
	/**
	 * @function isContentEditable
	 * @hide
	 *
	 * Determines if an element is contenteditable.
	 *
	 * An element is contenteditable if it contains the `contenteditable`
	 * attribute set to either an empty string or "true".
	 *
	 * By default an element is also contenteditable if its immediate parent
	 * has a truthy version of the attribute, unless the element is explicitly
	 * set to "false".
	 *
	 * @param {HTMLElement} el
	 * @return {Boolean} returns if the element is editable
	 */
	// Function for determining of an element is contenteditable
	var isContentEditable = (function(){
		// A contenteditable element has a value of an empty string or "true"
		var values = {
			"": true,
			"true": true,
			"false": false
		};

		// Tests if an element has the appropriate contenteditable attribute
		var editable = function(el){
			// DocumentFragments do not have a getAttribute
			if(!el || !el.getAttribute) {
				return;
			}

			var attr = el.getAttribute("contenteditable");
			return values[attr];
		};

		return function (el){
			// First check if the element is explicitly true or false
			var val = editable(el);
			if(typeof val === "boolean") {
				return val;
			} else {
				// Otherwise, check the parent
				return !!editable(el.parentNode);
			}
		};
	})(),
		removeBrackets = function(value, open, close){
			open = open || "{";
			close = close || "}";

			if(value[0] === open && value[value.length-1] === close) {
				return value.substr(1, value.length - 2);
			}
			return value;
		},
		getValue = function(value){
			return value && value.isComputed ? value() : value;
		},
		unbindUpdate = function(compute, updateOther){
			if(compute && compute.isComputed && typeof updateOther === "function") {
				compute.unbind("change", updateOther);
			}
		};

	
	// ## Special Event Types (can-SPECIAL)

	// A special object, similar to [$.event.special](http://benalman.com/news/2010/03/jquery-special-events/),
	// for adding hooks for special can-SPECIAL types (not native DOM events). Right now, only can-enter is
	// supported, but this object might be exported so that it can be added to easily.
	//
	// To implement a can-SPECIAL event type, add a property to the special object, whose value is a function
	// that returns the following:
	//
	//		// the real event name to bind to
	//		event: "event-name",
	//		handler: function (ev) {
	//			// some logic that figures out if the original handler should be called or not, and if so...
	//			return original.call(this, ev);
	//		}
	var special = {
		enter: function (data, el, original) {
			return {
				event: "keyup",
				handler: function (ev) {
					if (ev.keyCode === 13) {
						return original.call(this, ev);
					}
				}
			};
		}
	};


	can.bindings = {
		behaviors: behaviors,
		getBindingInfo: getBindingInfo
	};
	return can.bindings;
});
