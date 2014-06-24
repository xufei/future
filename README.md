ng-mini
=======

2012年，因为考虑可定制的Web开发平台这么一个需求，无意中看到了AngularJS框架，不禁为它的强大而震撼，随即打印了当时版本的完整源码，进行阅读。

在阅读AngularJS源码的过程中，发现了里面很多复杂的技巧，然后，也跟其他流行的前端MV☆框架作了对比。离开代码，独自沉思，回想这些年遇到的各种业务场景，也尝试用各种框架来构造它们，总是难以完全满意。

很多人用Angular是因为它的强大，但用的过程中也踩了不少坑，而从架构的角度看，它所做的事情也太多了一点。如果能够保留它的优点，把它的缺点改进掉，会不会很好呢？

有另外一个项目叫做AngularLight，它是一个很好的精简版，可以一试。虽然有它在先，但我还是想从自己的角度，去重新分析其中一些细节。

本项目的实现思路受益于Tero Parviainen的《Build your own angular》系列，在此向他致敬。


## 双向绑定与脏检测

Angular实现了双向绑定机制。所谓的双向绑定，无非是从界面的操作能实时反映到数据，数据的变更能实时展现到界面。这个过程的大致原理很简单：

```HTML
<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8" />
		<title>two-way binding</title>
	</head>
	<body onload="init()">
		<button ng-click="inc">
			increase 1
		</button>
		<button ng-click="inc2">
			increase 2
		</button>
		<span style="color:red" ng-bind="counter"></span>
		<span style="color:blue" ng-bind="counter"></span>
		<span style="color:green" ng-bind="counter"></span>

		<script type="text/javascript">
			/* 数据模型区开始 */
			var counter = 0;

			function inc() {
				counter++;
			}
			
			function inc2() {
				counter+=2;
			}
			/* 数据模型区结束 */
			
			/* 绑定关系区开始 */
			function init() {
				bind();
			}

			function bind() {
				var list = document.querySelectorAll("[ng-click]");
				for (var i=0; i<list.length; i++) {
					list[i].onclick = (function(index) {
						return function() {
							window[list[index].getAttribute("ng-click")]();
							apply();
						};
					})(i);
				}
			}

			function apply() {
				var list = document.querySelectorAll("[ng-bind='counter']");
				for (var i=0; i<list.length; i++) {
					list[i].innerHTML = counter;
				}
			}
			/* 绑定关系区开始 */
		</script>
	</body>
</html>
```

可以看到，在这么一个简单的例子中，我们做了一些双向绑定的事情。从两个按钮的点击到数据的变更，这个很好理解，但我们没有直接使用DOM的onclick方法，而是搞了一个ng-click，然后在bind里面把这个ng-click对应的函数拿出来，绑定到onclick的事件处理函数中。为什么要这样呢？

考虑到另外一个方面，当数据变更的时候，需要把这个变更应用到界面上，也就是那三个span里。但由于Angular使用的是脏检测，意味着当改变数据之后，你自己要做一些事情来触发脏检测，然后再应用到这个数据对应的DOM元素上。问题就在于，怎样触发脏检测？什么时候触发？

我们知道，一些基于setter的框架，它可以在给数据设值的时候，对DOM元素上的绑定变量作重新赋值。脏检测的机制没有这个阶段，所以只能在每个事件中手动调用apply()，把数据的变更应用到界面上。在真正的Angular实现中，这里先进行脏检测，确定数据有变化了，然后才对界面设值。

不理解Angular的人可能会踩到这样的坑，假设有一个指令：

```JavaScript
app.directive("myclick", function() {
	return function (scope, element, attr) {
		element.click(function() {
			scope.counter++;
		});
	}
});
```

```JavaScript
function CounterCtrl($scope) {
	$scope.counter = 0;
}
```

```HTML
<div>
	<button myclick>increase</button>
	<span ng-bind="counter"></span>
</div>
```

这个时候，点击按钮，界面上的数字并不会增加，很多人会感到迷惑，因为他查看调试器，发现数据确实已经增加了，Angular不是双向绑定吗，为什么数据变化了，界面没有跟着刷新？这是因为你自己的事件，最后没有做这么一步apply的事情，所以，需要scope.$digest()，或者scope.$apply()来让这些变更应用到界面上。

很多人对Angular的脏检测机制感到不屑，推崇基于setter，getter的观测机制，在我看来，这只是同一个事情的不同实现方式，并没有谁完全胜过谁，两者是各有优劣的。

大家都知道，在循环中批量添加DOM元素的时候，会推荐使用DocumentFragment，为什么呢，因为如果每次都对DOM产生变更，它都要修改DOM树的结构，性能影响大，如果我们能先在文档碎片中把DOM结构创建好，然后整体添加到主文档中，这个DOM树的变更就会一次完成，性能会提高很多。

同理，在Angular框架里，考虑到这样的场景：

```JavaScript
function TestCtrl($scope) {
	var list = [];
	
	for (var i=0; i<10000; i++) {
		list.push({
			index: i,
			checked: false
		});
	}
	
	$scope.list = list;
	
	$scope.toggleChecked = function(flag) {
		for (var i=0; i<list.length; i++) {
			list[i].checked = flag;
		}
	};
}
```

如果调用这个toggleChecked，会怎样？在脏检测的机制下，这个过程毫无压力，一次做完所有数据变更，然后整体应用到界面上。这时候，基于setter的机制就惨了，每次set都要变更一次界面……

## 作用域继承

在Angular中，存在作用域的继承。所谓作用域的继承，是指：如果两个视图有包含关系，内层视图对应的作用域可以共享外层视图作用域的数据。比如说：

```HTML
<div ng-controller="OuterCtrl">
	<span ng-model="a"></span>
	<div ng-controller="InnerCtrl">
		<span ng-model="a"></span>
		<span ng-model="b"></span>
	</div>
</div>
```

```JavaScript
function OuterCtrl($scope) {
	$scope.a = "hello";
}

function InnerCtrl($scope) {
	$scope.b = "hello";
}
```

内层的这个div上，一样也可以绑定变量a，因为在Angular内部，InnerCtrl的实例的原型会被设置为OuterCtrl的实例。

这么做在很多情况下是很方便，但造成问题的可能性也会非常多。真的需要这样的共享机制吗？

大家都知道，组件化是解决开发效率不高的银弹，但具体如何做组件化，人们的看法是五花八门的。Angular提供的控制器，服务，指令等概念，把不同的东西隔离到各自的地方，这是一种很好的组件化思路，但与此同时，界面模板层非常乱。

我们可以理解它的用意：只把界面模板层当作配置文件来使用，压根就不考虑它的可复用性。是啊，反正只用一次，就算我写得乱，又怎样呢？可是在Angular中，界面模板是跟控制器密切相关的。我很怀疑控制器的可重用性，注意，它虽然叫控制器，但其实更应该算视图模型。

从可重用性角度来看，如果满分5分的话，整个应用的这些部分的得分应当是这样：

- 服务，比如说，对后端RESTful接口的AJAX调用，对本地存储的访问等，5分
- 控制器（也就是视图模型），2分
- 指令，这个要看情况，有的指令是当作对HTML元素体系的扩展来用的，有些是其他事情的
	- 纯UI类型的指令，也可以算是控件，比如DatetimePicker，5分
	- 有些用于沟通DOM跟视图模型的指令，2分
- 界面模板，这个基本就没有重用性了，1分

从这里我们可以看到，以可重用度来排序，最有价值的是服务和控件，服务代表着业务逻辑的基本单元，控件代表了UI层的最小单元，所以它们是最值得重用的。

现在来看看中间层：视图模型值得重用吗？还是值得的。比如说，同一视图模型以不同的界面模板来展现，这就是一种很好的方式。如果说，同一个视图模型要支持多个界面模板，这些界面模板使用的模型字段或者方法有差异，也可以考虑在视图模型中取并集。例如：

```JavaScript
function TestCtrl($scope) {
	$scope.counter = 0;
	
	$scope.increase = function() {
		$scope.counter++;
	};
	
	$scope.decrease = function() {
		$scope.counter--;
	};
}
```

*1.html*
```HTML
<div ng-controller="TestCtrl">
	<span ng-bind="counter"></span>
	<button ng-click="increase()">increase</button>
</div>
```

*2.html*
```HTML
<div ng-controller="TestCtrl">
	<span ng-bind="counter"></span>
	<button ng-click="decrease()">decrease</button>
</div>
```

*3.html*
```HTML
<div ng-controller="TestCtrl">
	<span ng-bind="counter"></span>
	<button ng-click="increase()">increase</button>
	<button ng-click="decrease()">decrease</button>
</div>
```

三个视图的内容是有差异的，但它们仍然共用了同一个视图模型，这个视图模型的内容包含三个视图所能用到的所有属性和方法，每个视图各取所需，互不影响。

这时候，我们再来看视图模型的继承会造成什么影响。如果是我们有了视图模型的继承关系，就意味着界面模板的包含关系必须跟视图模型的继承关系完全一致，这个很大程度上是增加了管理成本的，也造成了视图模型的非通用性。

[这里准备放个图]

那么，Angular是为了什么引入视图模型的继承呢，我认为是从这些角度：

1. 数组和对象属性的迭代。

在Angular里面，有ng-repeat指令，可以用于遍历数组元素、对象属性。

```HTML
<ul>
	<li ng-repeat="member in members">{{member.name}}</li>
</ul>
```

单从这个片段看，看不出视图继承的意义。我们把这个例子再拓展一下：

```HTML
<ul>
	<li ng-repeat="member in members">{{member.name}} in {{teamname}}</li>
</ul>
```

它对应的视图模型是这么个结构：

```JavaScript
function TeamCtrl($scope) {
	$scope.teamname = "Disney";
	
	$scope.members = [
		{name: "Tom Cat"},
		{name: "Jerry Mouse"},
		{name: "Donald Duck"},
		{name: "Micky Mouse"}
	];
}
```

好了，注意到这里，teamname跟members里面的成员其实不在一层作用域，因为它给循环的每个元素都建立了单独的作用域，如果不允许视图模型的继承，在li里面是没法访问到teamname的。为了让这段话更容易理解，我作个转换：

```JavaScript
var teamname = "Disney";
var members = [
	{name: "Tom Cat"},
	{name: "Jerry Mouse"},
	{name: "Donald Duck"},
	{name: "Micky Mouse"}
];

for (var i=0; i<members.length; i++) {
	var member = members[i];
	console.log(member.name + " in " + teamname);
}
```

ng-repeat内部给每个循环造了个作用域，如果不这么做，各个member就无法区分开了。

2. 另外一个造成视图继承的原因是动态引入界面模板，比如说ng-include和ng-view等。

*inner.html*
```HTML
<div>
	<span ng-bind="name"></span>
</div>
```

*outer.html*
```HTML
<div ng-controller="OuterCtrl">
	<span ng-bind="name"></span>
	<div ng-include="'inner.html'"></div>
</div>
```

```JavaScript
function OuterCtrl($scope) {
	$scope.name = "outer name";
}
```

对上面这个例子来说，ng-include会创建一层作用域，如果不允许作用域继承，那么内层的HTML中就拿不到name属性。那么，为什么ng-include一定要创建子作用域呢？在这个例子里，创建子作用域并不合理，直接让两层HTML模板对应同一个视图模型的实例，不就可以了？

考虑更复杂一些的情况，inner.html这个模板指定了自己的控制器：

*inner.html*
```HTML
<div ng-controller="InnerCtrl">
	<span ng-bind="name"></span>
</div>
```

```JavaScript
function InnerCtrl($scope) {
	$scope.name = "inner name";
}
```

这时候就麻烦了，必须创建子作用域，因为它有自己的视图模型了。

到这里，我们也可以说，那就判断一下，假如被include进来的模板指定了控制器，就创建子作用域，如果没有指定，就不创建。

考虑到还有一种特殊的情况，如果两层HTML模板指定了同一个控制器，是否都要实例化？这个都要实例化的意思，其实只是问内层的是否要实例化，因为外层的肯定是要实例化的。

所以，在这个层面看，Polymer这类框架就是垂直的端到端组件，不存在“视图继承”这么一种奇怪的关系。通常人们所说的前端组件化，一般指的也就是Polymer这种方式，所以
