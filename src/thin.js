"use strict";

(function (win, doc, _) {
	var readyFunctions = [];

	var noop = function () {
	};

	var uuid = function () {
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
			var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	};

	var Events = {
		$on: function (eventType, handler) {
			if (!this.eventMap) {
				this.eventMap = {};
			}

			//multiple event listener
			if (!this.eventMap[eventType]) {
				this.eventMap[eventType] = [];
			}
			this.eventMap[eventType].push(handler);
		},

		$off: function (eventType, handler) {
			for (var i = 0; i < this.eventMap[eventType].length; i++) {
				if (this.eventMap[eventType][i] === handler) {
					this.eventMap[eventType].splice(i, 1);
					break;
				}
			}
		},

		$fire: function (event) {
			var eventType = event.type;
			if (this.eventMap && this.eventMap[eventType]) {
				for (var i = 0; i < this.eventMap[eventType].length; i++) {
					this.eventMap[eventType][i](event);
				}
			}
		}
	};

	var thin = function () {
	};

	_.extend(thin, Events);

	_.extend(thin, {
		ready: function (handler, priority) {
			priority = priority || 1;

			if (!readyFunctions[priority]) {
				readyFunctions[priority] = [];
			}
			readyFunctions[priority].push(handler);
		},

		error: function () {

		},

		log: function (obj) {
			try {
				console.log(obj);
			}
			catch (ex) {

			}
		}
	});

	var addListener = doc.addEventListener || doc.attachEvent,
		removeListener = doc.removeEventListener || doc.detachEvent;

	var eventName = doc.addEventListener ? "DOMContentLoaded" : "onreadystatechange";

	addListener.call(doc, eventName, function () {
		for (var i = readyFunctions.length - 1; i >= 0; i--) {
			if (readyFunctions[i]) {
				for (var j = 0; j < readyFunctions[i].length; j++) {
					readyFunctions[i][j]();
				}
			}
		}
	}, false);

	var bindingMap = {};
	var changeQueue = [];

	function enqueue(item) {
		changeQueue.push(item);
	}

	function addBinding(vm, key, handler) {
		if (!bindingMap[vm]) {
			bindingMap[vm] = {};
		}

		if (!bindingMap[vm][key]) {
			bindingMap[vm][key] = [];
		}

		bindingMap[vm][key].push(handler);
	}

	function performChange() {
		window.setTimeout(function() {
			changeQueue.forEach(function(item) {
				item.handler(item.value);
			});
			changeQueue = [];
		}, 0);
	}

	thin.$watch = function (model) {
		Object.observe(model, function (changes) {
			changes.forEach(function (change, i) {
				console.log(change);
				bindingMap[change.object][change.name].forEach(function(handler) {
					enqueue({
						handler: handler,
						value: change.object[change.name]
					});
				});
			});
		});
	};

	var parser = (function () {
		function parseElement(element, vm) {
			var model = vm;

			if (element.getAttribute("vm-model")) {
				model = bindModel(element.getAttribute("vm-model"));
			}

			var i;
			for (i = 0; i < element.attributes.length; i++) {
				parseAttribute(element, element.attributes[i], model);
			}

			for (i = 0; i < element.children.length; i++) {
				parseElement(element.children[i], model);
			}

			if (model && model.$initializer) {
				model.$initializer();
			}
		}

		function parseAttribute(element, attr, model) {
			if (attr.name.indexOf("vm-") === 0) {
				var type = attr.name.slice(3);

				switch (type) {
					case "init":
						bindInit(element, attr.value, model);
						break;
					case "value":
						bindValue(element, attr.value, model);
						break;
					case "list":
						bindList(element, attr.value, model);
						break;
					case "click":
						bindClick(element, attr.value, model);
						break;
					case "enable":
						bindEnable(element, attr.value, model, true);
						break;
					case "disable":
						bindEnable(element, attr.value, model, false);
						break;
					case "visible":
						bindVisible(element, attr.value, model, true);
						break;
					case "invisible":
						bindVisible(element, attr.value, model, false);
						break;
					case "element":
						model[attr.value] = element;
						break;
				}
			}
		}

		function bindModel(name) {
			thin.log("binding model: " + name);

			var vm = {};
			thin.$watch(vm);

			var instance = new window[name]();
			_.extend(vm, instance);

			return vm;
		}

		function bindValue(element, key, vm) {
			thin.log("binding value: " + key);

			addBinding(vm, key, function(value) {
				element.value = value || "";
			});

			switch (element.tagName) {
				case "SELECT": {
					bindSelectValue(element, key, vm);
					break;
				}
				default: {
					bindTextValue(element, key, vm);
					break;
				}
			}

			function bindTextValue(el, key, model) {
				el.onkeyup = function () {
					model[key] = el.value;
					performChange();
				};

				el.onpaste = function () {
					model[key] = el.value;
					performChange();
				};
			}

			function bindSelectValue(el, key, model) {
				el.onchange = function () {
					vm[key] = el.value;
					performChange();
				};
			}
		}

		function bindList(element, key, vm) {
			thin.log("binding list: " + key);

			vm.$watch(key, function (value, oldValue) {
				var selectedValue = element.value;
				element.innerHTML = null;

				for (var i = 0; i < value.length; i++) {
					var item = document.createElement("option");
					item.innerHTML = value[i].label;
					item.value = value[i].key;

					element.appendChild(item);
				}
				element.value = selectedValue;
			});
		}

		function bindInit(element, key, vm) {
			thin.log("binding init: " + key);

			vm.$initializer = (function (model) {
				return function () {
					model[key]();
					performChange();
				};
			})(vm);
		}

		function bindClick(element, key, vm) {
			thin.log("binding click: " + key);

			element.onclick = function () {
				vm[key]();
				performChange();
			};
		}

		function bindEnable(element, key, vm, direction) {
			thin.log("binding enable: " + key);

			if (typeof vm[key] == "function") {
				changeHandlers.push(function() {
					element.disabled = vm[key]() ^ direction ? true : false;
				});
			}
			else {
				vm.$watch(key, function (value, oldValue) {
					element.disabled = value ^ direction ? true : false;
				});
			}
		}

		function bindVisible(element, key, vm, direction) {
			thin.log("binding visible: " + key);

			if (typeof vm[key] == "function") {
				changeHandlers.push(function() {
					element.style.display = vm[key]() ^ direction ? "none" : "";
				});
			}
			else {
				vm.$watch(key, function (value, oldValue) {
					element.style.display = value ^ direction ? "none" : "";
				});
			}
		}

		return {
			parse: parseElement
		};
	})();

	thin.ready(function() {
		parser.parse(doc.body);
		performChange();
	});
})(window, document, _);