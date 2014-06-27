function Scope() {
	this.$$watchers = [];
	this.$$lastDirtyWatch = null;
	this.$$asyncQueue = [];
	this.$$postDigestQueue = [];
	this.$$root = this;
	this.$$children = [];
	this.$$listeners = {};
	this.$$phase = null;
}

Scope.prototype.$beginPhase = function(phase) {
	if (this.$$phase) {
		throw this.$$phase + ' already in progress.';
	}
	this.$$phase = phase;
};

Scope.prototype.$clearPhase = function() {
	this.$$phase = null;
};

Scope.prototype.$new = function(isolated) {
	var child = new Scope();
	child.$$root = this.$$root;
	child.$$asyncQueue = this.$$asyncQueue;
	child.$$postDigestQueue = this.$$postDigestQueue;
	this.$$children.push(child);
	child.$$watchers = [];
	child.$$listeners = {};
	child.$$children = [];
	child.$parent = this;
	return child;
};

Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
	var self = this;

	watchFn = $parse(watchFn);
	listenerFn = $parse(listenerFn);

	var watcher = {
		watchFn : watchFn,
		listenerFn : listenerFn,
		last : initWatchVal,
		valueEq : !!valueEq
	};

	if (watchFn.constant) {
		watcher.listenerFn = function(newValue, oldValue, scope) {
			listenerFn(newValue, oldValue, scope);
			var index = self.$$watchers.indexOf(watcher);
			if (index >= 0) {
				self.$$watchers.splice(index, 1);
			}
		};
	}

	this.$$watchers.unshift(watcher);
	this.$$root.$$lastDirtyWatch = null;
	return function() {
		var index = self.$$watchers.indexOf(watcher);
		if (index >= 0) {
			self.$$watchers.splice(index, 1);
			self.$$root.$$lastDirtyWatch = null;
		}
	};
};

Scope.prototype.$watchCollection = function(watchFn, listenerFn) {
	var self = this;
	var newValue;
	var oldValue;
	var oldLength;
	var veryOldValue;
	var trackVeryOldValue = (listenerFn.length > 1);
	var changeCount = 0;
	var firstRun = true;

	watchFn = $parse(watchFn);
	listenerFn = $parse(listenerFn);

	var internalWatchFn = function(scope) {
		var newLength, key;

		newValue = watchFn(scope);
		if (_.isObject(newValue)) {
			if (_.isArrayLike(newValue)) {
				if (!_.isArray(oldValue)) {
					changeCount++;
					oldValue = [];
				}
				if (newValue.length !== oldValue.length) {
					changeCount++;
					oldValue.length = newValue.length;
				}
				_.forEach(newValue, function(newItem, i) {
					if (newItem !== oldValue[i]) {
						changeCount++;
						oldValue[i] = newItem;
					}
				});
			} else {
				if (!_.isObject(oldValue) || _.isArrayLike(oldValue)) {
					changeCount++;
					oldValue = {};
					oldLength = 0;
				}
				newLength = 0;
				for (key in newValue) {
					if (newValue.hasOwnProperty(key)) {
						newLength++;
						if (oldValue.hasOwnProperty(key)) {
							if (oldValue[key] !== newValue[key]) {
								changeCount++;
								oldValue[key] = newValue[key];
							}
						} else {
							changeCount++;
							oldLength++;
							oldValue[key] = newValue[key];
						}
					}
				}
				if (oldLength > newLength) {
					changeCount++;
					for (key in oldValue) {
						if (oldValue.hasOwnProperty(key) && !newValue.hasOwnProperty(key)) {
							oldLength--;
							delete oldValue[key];
						}
					}
				}
			}
		} else {
			if (!self.$$areEqual(newValue, oldValue, false)) {
				changeCount++;
			}
			oldValue = newValue;
		}

		return changeCount;
	};

	var internalListenerFn = function() {
		if (firstRun) {
			listenerFn(newValue, newValue, self);
			firstRun = false;
		} else {
			listenerFn(newValue, veryOldValue, self);
		}

		if (trackVeryOldValue) {
			veryOldValue = _.clone(newValue);
		}
	};

	return this.$watch(internalWatchFn, internalListenerFn);
};

Scope.prototype.$digest = function() {
	var ttl = TTL;
	var dirty;
	this.$$root.$$lastDirtyWatch = null;
	this.$beginPhase("$digest");
	do {
		while (this.$$asyncQueue.length) {
			try {
				var asyncTask = this.$$asyncQueue.shift();
				asyncTask.scope.$eval(asyncTask.expression);
			} catch (e) {
				console.error(e);
			}
		}
		dirty = this.$$digestOnce();
		if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
			throw TTL + " digest iterations reached";
		}
	} while (dirty || this.$$asyncQueue.length);
	this.$clearPhase();

	while (this.$$postDigestQueue.length) {
		try {
			this.$$postDigestQueue.shift()();
		} catch (e) {
			console.error(e);
		}
	}
};

Scope.prototype.$$digestOnce = function() {
	var dirty;
	var continueLoop = true;
	this.$$everyScope(function(scope) {
		var newValue, oldValue;
		_.forEachRight(scope.$$watchers, function(watcher) {
			try {
				if (watcher) {
					newValue = watcher.watchFn(scope);
					oldValue = watcher.last;
					if (!scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
						scope.$$root.$$lastDirtyWatch = watcher;
						watcher.last = (watcher.valueEq ? _.cloneDeep(newValue) : newValue);
						watcher.listenerFn(newValue, (oldValue === initWatchVal ? newValue : oldValue), scope);
						dirty = true;
					} else if (scope.$$root.$$lastDirtyWatch === watcher) {
						continueLoop = false;
						return false;
					}
				}
			} catch (e) {
				console.error(e);
			}
		});
		return continueLoop;
	});
	return dirty;
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
	if (valueEq) {
		return _.isEqual(newValue, oldValue);
	} else {
		return newValue === oldValue || ( typeof newValue === 'number' && typeof oldValue === 'number' && isNaN(newValue) && isNaN(oldValue));
	}
};

Scope.prototype.$$everyScope = function(fn) {
	if (fn(this)) {
		return this.$$children.every(function(child) {
			return child.$$everyScope(fn);
		});
	} else {
		return false;
	}
};

Scope.prototype.$eval = function(expr, locals) {
	return $parse(expr)(this, locals);
};

Scope.prototype.$apply = function(expr) {
	try {
		this.$beginPhase("$apply");
		return this.$eval(expr);
	} finally {
		this.$clearPhase();
		this.$$root.$digest();
	}
};

Scope.prototype.$evalAsync = function(expr) {
	var self = this;
	if (!self.$$phase && !self.$$asyncQueue.length) {
		setTimeout(function() {
			if (self.$$asyncQueue.length) {
				self.$$root.$digest();
			}
		}, 0);
	}
	this.$$asyncQueue.push({
		scope : this,
		expression : expr
	});
};

Scope.prototype.$$postDigest = function(fn) {
	this.$$postDigestQueue.push(fn);
};

Scope.prototype.$destroy = function() {
	if (this === this.$$root) {
		return;
	}
	var siblings = this.$parent.$$children;
	var indexOfThis = siblings.indexOf(this);
	if (indexOfThis >= 0) {
		this.$broadcast('$destroy');
		siblings.splice(indexOfThis, 1);
	}
};

Scope.prototype.$on = function(eventName, listener) {
	var listeners = this.$$listeners[eventName];
	if (!listeners) {
		this.$$listeners[eventName] = listeners = [];
	}
	listeners.push(listener);
	return function() {
		var index = listeners.indexOf(listener);
		if (index >= 0) {
			listeners[index] = null;
		}
	};
};

Scope.prototype.$emit = function(eventName) {
	var propagationStopped = false;
	var event = {
		name : eventName,
		targetScope : this,
		stopPropagation : function() {
			propagationStopped = true;
		},
		preventDefault : function() {
			event.defaultPrevented = true;
		}
	};
	var listenerArgs = [event].concat(_.rest(arguments));
	var scope = this;
	do {
		event.currentScope = scope;
		scope.$$fireEventOnScope(eventName, listenerArgs);
		scope = scope.$parent;
	} while (scope && !propagationStopped);
	return event;
};

Scope.prototype.$broadcast = function(eventName) {
	var event = {
		name : eventName,
		targetScope : this,
		preventDefault : function() {
			event.defaultPrevented = true;
		}
	};
	var listenerArgs = [event].concat(_.rest(arguments));
	this.$$everyScope(function(scope) {
		event.currentScope = scope;
		scope.$$fireEventOnScope(eventName, listenerArgs);
		return true;
	});
	return event;
};

Scope.prototype.$$fireEventOnScope = function(eventName, listenerArgs) {
	var listeners = this.$$listeners[eventName] || [];
	var i = 0;
	while (i < listeners.length) {
		if (listeners[i] === null) {
			listeners.splice(i, 1);
		} else {
			try {
				listeners[i].apply(null, listenerArgs);
			} catch (e) {
				console.error(e);
			}
			i++;
		}
	}
};
