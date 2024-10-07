var SiteDesignPreview = (function () {
	'use strict';

	/** @returns {void} */
	function noop$3() {}

	const identity = (x) => x;

	/**
	 * @template T
	 * @template S
	 * @param {T} tar
	 * @param {S} src
	 * @returns {T & S}
	 */
	function assign(tar, src) {
		// @ts-ignore
		for (const k in src) tar[k] = src[k];
		return /** @type {T & S} */ (tar);
	}

	/** @returns {void} */
	function add_location(element, file, line, column, char) {
		element.__svelte_meta = {
			loc: { file, line, column, char }
		};
	}

	function run(fn) {
		return fn();
	}

	function blank_object() {
		return Object.create(null);
	}

	/**
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function run_all(fns) {
		fns.forEach(run);
	}

	/**
	 * @param {any} thing
	 * @returns {thing is Function}
	 */
	function is_function(thing) {
		return typeof thing === 'function';
	}

	/** @returns {boolean} */
	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
	}

	let src_url_equal_anchor;

	/**
	 * @param {string} element_src
	 * @param {string} url
	 * @returns {boolean}
	 */
	function src_url_equal(element_src, url) {
		if (element_src === url) return true;
		if (!src_url_equal_anchor) {
			src_url_equal_anchor = document.createElement('a');
		}
		// This is actually faster than doing URL(..).href
		src_url_equal_anchor.href = url;
		return element_src === src_url_equal_anchor.href;
	}

	/** @returns {boolean} */
	function is_empty(obj) {
		return Object.keys(obj).length === 0;
	}

	/** @returns {void} */
	function validate_store(store, name) {
		if (store != null && typeof store.subscribe !== 'function') {
			throw new Error(`'${name}' is not a store with a 'subscribe' method`);
		}
	}

	function subscribe(store, ...callbacks) {
		if (store == null) {
			for (const callback of callbacks) {
				callback(undefined);
			}
			return noop$3;
		}
		const unsub = store.subscribe(...callbacks);
		return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
	}

	/**
	 * Get the current value from a store by subscribing and immediately unsubscribing.
	 *
	 * https://svelte.dev/docs/svelte-store#get
	 * @template T
	 * @param {import('../store/public.js').Readable<T>} store
	 * @returns {T}
	 */
	function get_store_value(store) {
		let value;
		subscribe(store, (_) => (value = _))();
		return value;
	}

	/** @returns {void} */
	function component_subscribe(component, store, callback) {
		component.$$.on_destroy.push(subscribe(store, callback));
	}

	function create_slot(definition, ctx, $$scope, fn) {
		if (definition) {
			const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
			return definition[0](slot_ctx);
		}
	}

	function get_slot_context(definition, ctx, $$scope, fn) {
		return definition[1] && fn ? assign($$scope.ctx.slice(), definition[1](fn(ctx))) : $$scope.ctx;
	}

	function get_slot_changes(definition, $$scope, dirty, fn) {
		if (definition[2] && fn) {
			const lets = definition[2](fn(dirty));
			if ($$scope.dirty === undefined) {
				return lets;
			}
			if (typeof lets === 'object') {
				const merged = [];
				const len = Math.max($$scope.dirty.length, lets.length);
				for (let i = 0; i < len; i += 1) {
					merged[i] = $$scope.dirty[i] | lets[i];
				}
				return merged;
			}
			return $$scope.dirty | lets;
		}
		return $$scope.dirty;
	}

	/** @returns {void} */
	function update_slot_base(
		slot,
		slot_definition,
		ctx,
		$$scope,
		slot_changes,
		get_slot_context_fn
	) {
		if (slot_changes) {
			const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
			slot.p(slot_context, slot_changes);
		}
	}

	/** @returns {any[] | -1} */
	function get_all_dirty_from_scope($$scope) {
		if ($$scope.ctx.length > 32) {
			const dirty = [];
			const length = $$scope.ctx.length / 32;
			for (let i = 0; i < length; i++) {
				dirty[i] = -1;
			}
			return dirty;
		}
		return -1;
	}

	/** @returns {{}} */
	function exclude_internal_props(props) {
		const result = {};
		for (const k in props) if (k[0] !== '$') result[k] = props[k];
		return result;
	}

	/** @returns {{}} */
	function compute_rest_props(props, keys) {
		const rest = {};
		keys = new Set(keys);
		for (const k in props) if (!keys.has(k) && k[0] !== '$') rest[k] = props[k];
		return rest;
	}

	function null_to_empty(value) {
		return value == null ? '' : value;
	}

	/** @param {number | string} value
	 * @returns {[number, string]}
	 */
	function split_css_unit(value) {
		const split = typeof value === 'string' && value.match(/^\s*(-?[\d.]+)([^\s]*)\s*$/);
		return split ? [parseFloat(split[1]), split[2] || 'px'] : [/** @type {number} */ (value), 'px'];
	}

	const is_client = typeof window !== 'undefined';

	/** @type {() => number} */
	let now = is_client ? () => window.performance.now() : () => Date.now();

	let raf = is_client ? (cb) => requestAnimationFrame(cb) : noop$3;

	const tasks = new Set();

	/**
	 * @param {number} now
	 * @returns {void}
	 */
	function run_tasks(now) {
		tasks.forEach((task) => {
			if (!task.c(now)) {
				tasks.delete(task);
				task.f();
			}
		});
		if (tasks.size !== 0) raf(run_tasks);
	}

	/**
	 * Creates a new task that runs on each raf frame
	 * until it returns a falsy value or is aborted
	 * @param {import('./private.js').TaskCallback} callback
	 * @returns {import('./private.js').Task}
	 */
	function loop(callback) {
		/** @type {import('./private.js').TaskEntry} */
		let task;
		if (tasks.size === 0) raf(run_tasks);
		return {
			promise: new Promise((fulfill) => {
				tasks.add((task = { c: callback, f: fulfill }));
			}),
			abort() {
				tasks.delete(task);
			}
		};
	}

	/** @type {typeof globalThis} */
	const globals =
		typeof window !== 'undefined'
			? window
			: typeof globalThis !== 'undefined'
			? globalThis
			: // @ts-ignore Node typings have this
			  global;

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @returns {void}
	 */
	function append(target, node) {
		target.appendChild(node);
	}

	/**
	 * @param {Node} target
	 * @param {string} style_sheet_id
	 * @param {string} styles
	 * @returns {void}
	 */
	function append_styles(target, style_sheet_id, styles) {
		const append_styles_to = get_root_for_style(target);
		if (!append_styles_to.getElementById(style_sheet_id)) {
			const style = element('style');
			style.id = style_sheet_id;
			style.textContent = styles;
			append_stylesheet(append_styles_to, style);
		}
	}

	/**
	 * @param {Node} node
	 * @returns {ShadowRoot | Document}
	 */
	function get_root_for_style(node) {
		if (!node) return document;
		const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
		if (root && /** @type {ShadowRoot} */ (root).host) {
			return /** @type {ShadowRoot} */ (root);
		}
		return node.ownerDocument;
	}

	/**
	 * @param {Node} node
	 * @returns {CSSStyleSheet}
	 */
	function append_empty_stylesheet(node) {
		const style_element = element('style');
		// For transitions to work without 'style-src: unsafe-inline' Content Security Policy,
		// these empty tags need to be allowed with a hash as a workaround until we move to the Web Animations API.
		// Using the hash for the empty string (for an empty tag) works in all browsers except Safari.
		// So as a workaround for the workaround, when we append empty style tags we set their content to /* empty */.
		// The hash 'sha256-9OlNO0DNEeaVzHL4RZwCLsBHA8WBQ8toBp/4F5XV2nc=' will then work even in Safari.
		style_element.textContent = '/* empty */';
		append_stylesheet(get_root_for_style(node), style_element);
		return style_element.sheet;
	}

	/**
	 * @param {ShadowRoot | Document} node
	 * @param {HTMLStyleElement} style
	 * @returns {CSSStyleSheet}
	 */
	function append_stylesheet(node, style) {
		append(/** @type {Document} */ (node).head || node, style);
		return style.sheet;
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @param {Node} [anchor]
	 * @returns {void}
	 */
	function insert(target, node, anchor) {
		target.insertBefore(node, anchor || null);
	}

	/**
	 * @param {Node} node
	 * @returns {void}
	 */
	function detach(node) {
		if (node.parentNode) {
			node.parentNode.removeChild(node);
		}
	}

	/**
	 * @returns {void} */
	function destroy_each(iterations, detaching) {
		for (let i = 0; i < iterations.length; i += 1) {
			if (iterations[i]) iterations[i].d(detaching);
		}
	}

	/**
	 * @template {keyof HTMLElementTagNameMap} K
	 * @param {K} name
	 * @returns {HTMLElementTagNameMap[K]}
	 */
	function element(name) {
		return document.createElement(name);
	}

	/**
	 * @template {keyof SVGElementTagNameMap} K
	 * @param {K} name
	 * @returns {SVGElement}
	 */
	function svg_element(name) {
		return document.createElementNS('http://www.w3.org/2000/svg', name);
	}

	/**
	 * @param {string} data
	 * @returns {Text}
	 */
	function text(data) {
		return document.createTextNode(data);
	}

	/**
	 * @returns {Text} */
	function space() {
		return text(' ');
	}

	/**
	 * @returns {Text} */
	function empty() {
		return text('');
	}

	/**
	 * @param {EventTarget} node
	 * @param {string} event
	 * @param {EventListenerOrEventListenerObject} handler
	 * @param {boolean | AddEventListenerOptions | EventListenerOptions} [options]
	 * @returns {() => void}
	 */
	function listen(node, event, handler, options) {
		node.addEventListener(event, handler, options);
		return () => node.removeEventListener(event, handler, options);
	}

	/**
	 * @param {Element} node
	 * @param {string} attribute
	 * @param {string} [value]
	 * @returns {void}
	 */
	function attr(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
	}

	/**
	 * @param {Element & ElementCSSInlineStyle} node
	 * @param {{ [x: string]: string }} attributes
	 * @returns {void}
	 */
	function set_svg_attributes(node, attributes) {
		for (const key in attributes) {
			attr(node, key, attributes[key]);
		}
	}

	/**
	 * @param {Element} element
	 * @returns {ChildNode[]}
	 */
	function children(element) {
		return Array.from(element.childNodes);
	}

	/**
	 * @returns {void} */
	function set_input_value(input, value) {
		input.value = value == null ? '' : value;
	}

	/**
	 * @returns {void} */
	function set_style(node, key, value, important) {
		if (value == null) {
			node.style.removeProperty(key);
		} else {
			node.style.setProperty(key, value, important ? 'important' : '');
		}
	}

	/**
	 * @returns {void} */
	function toggle_class(element, name, toggle) {
		// The `!!` is required because an `undefined` flag means flipping the current state.
		element.classList.toggle(name, !!toggle);
	}

	/**
	 * @template T
	 * @param {string} type
	 * @param {T} [detail]
	 * @param {{ bubbles?: boolean, cancelable?: boolean }} [options]
	 * @returns {CustomEvent<T>}
	 */
	function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
		return new CustomEvent(type, { detail, bubbles, cancelable });
	}
	/** */
	class HtmlTag {
		/**
		 * @private
		 * @default false
		 */
		is_svg = false;
		/** parent for creating node */
		e = undefined;
		/** html tag nodes */
		n = undefined;
		/** target */
		t = undefined;
		/** anchor */
		a = undefined;
		constructor(is_svg = false) {
			this.is_svg = is_svg;
			this.e = this.n = null;
		}

		/**
		 * @param {string} html
		 * @returns {void}
		 */
		c(html) {
			this.h(html);
		}

		/**
		 * @param {string} html
		 * @param {HTMLElement | SVGElement} target
		 * @param {HTMLElement | SVGElement} anchor
		 * @returns {void}
		 */
		m(html, target, anchor = null) {
			if (!this.e) {
				if (this.is_svg)
					this.e = svg_element(/** @type {keyof SVGElementTagNameMap} */ (target.nodeName));
				/** #7364  target for <template> may be provided as #document-fragment(11) */ else
					this.e = element(
						/** @type {keyof HTMLElementTagNameMap} */ (
							target.nodeType === 11 ? 'TEMPLATE' : target.nodeName
						)
					);
				this.t =
					target.tagName !== 'TEMPLATE'
						? target
						: /** @type {HTMLTemplateElement} */ (target).content;
				this.c(html);
			}
			this.i(anchor);
		}

		/**
		 * @param {string} html
		 * @returns {void}
		 */
		h(html) {
			this.e.innerHTML = html;
			this.n = Array.from(
				this.e.nodeName === 'TEMPLATE' ? this.e.content.childNodes : this.e.childNodes
			);
		}

		/**
		 * @returns {void} */
		i(anchor) {
			for (let i = 0; i < this.n.length; i += 1) {
				insert(this.t, this.n[i], anchor);
			}
		}

		/**
		 * @param {string} html
		 * @returns {void}
		 */
		p(html) {
			this.d();
			this.h(html);
			this.i(this.a);
		}

		/**
		 * @returns {void} */
		d() {
			this.n.forEach(detach);
		}
	}

	/**
	 * @param {HTMLElement} element
	 * @returns {{}}
	 */
	function get_custom_elements_slots(element) {
		const result = {};
		element.childNodes.forEach(
			/** @param {Element} node */ (node) => {
				result[node.slot || 'default'] = true;
			}
		);
		return result;
	}

	/**
	 * @typedef {Node & {
	 * 	claim_order?: number;
	 * 	hydrate_init?: true;
	 * 	actual_end_child?: NodeEx;
	 * 	childNodes: NodeListOf<NodeEx>;
	 * }} NodeEx
	 */

	/** @typedef {ChildNode & NodeEx} ChildNodeEx */

	/** @typedef {NodeEx & { claim_order: number }} NodeEx2 */

	/**
	 * @typedef {ChildNodeEx[] & {
	 * 	claim_info?: {
	 * 		last_index: number;
	 * 		total_claimed: number;
	 * 	};
	 * }} ChildNodeArray
	 */

	// we need to store the information for multiple documents because a Svelte application could also contain iframes
	// https://github.com/sveltejs/svelte/issues/3624
	/** @type {Map<Document | ShadowRoot, import('./private.d.ts').StyleInformation>} */
	const managed_styles = new Map();

	let active = 0;

	// https://github.com/darkskyapp/string-hash/blob/master/index.js
	/**
	 * @param {string} str
	 * @returns {number}
	 */
	function hash(str) {
		let hash = 5381;
		let i = str.length;
		while (i--) hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
		return hash >>> 0;
	}

	/**
	 * @param {Document | ShadowRoot} doc
	 * @param {Element & ElementCSSInlineStyle} node
	 * @returns {{ stylesheet: any; rules: {}; }}
	 */
	function create_style_information(doc, node) {
		const info = { stylesheet: append_empty_stylesheet(node), rules: {} };
		managed_styles.set(doc, info);
		return info;
	}

	/**
	 * @param {Element & ElementCSSInlineStyle} node
	 * @param {number} a
	 * @param {number} b
	 * @param {number} duration
	 * @param {number} delay
	 * @param {(t: number) => number} ease
	 * @param {(t: number, u: number) => string} fn
	 * @param {number} uid
	 * @returns {string}
	 */
	function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
		const step = 16.666 / duration;
		let keyframes = '{\n';
		for (let p = 0; p <= 1; p += step) {
			const t = a + (b - a) * ease(p);
			keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
		}
		const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
		const name = `__svelte_${hash(rule)}_${uid}`;
		const doc = get_root_for_style(node);
		const { stylesheet, rules } = managed_styles.get(doc) || create_style_information(doc, node);
		if (!rules[name]) {
			rules[name] = true;
			stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
		}
		const animation = node.style.animation || '';
		node.style.animation = `${
		animation ? `${animation}, ` : ''
	}${name} ${duration}ms linear ${delay}ms 1 both`;
		active += 1;
		return name;
	}

	/**
	 * @param {Element & ElementCSSInlineStyle} node
	 * @param {string} [name]
	 * @returns {void}
	 */
	function delete_rule(node, name) {
		const previous = (node.style.animation || '').split(', ');
		const next = previous.filter(
			name
				? (anim) => anim.indexOf(name) < 0 // remove specific animation
				: (anim) => anim.indexOf('__svelte') === -1 // remove all Svelte animations
		);
		const deleted = previous.length - next.length;
		if (deleted) {
			node.style.animation = next.join(', ');
			active -= deleted;
			if (!active) clear_rules();
		}
	}

	/** @returns {void} */
	function clear_rules() {
		raf(() => {
			if (active) return;
			managed_styles.forEach((info) => {
				const { ownerNode } = info.stylesheet;
				// there is no ownerNode if it runs on jsdom.
				if (ownerNode) detach(ownerNode);
			});
			managed_styles.clear();
		});
	}

	/**
	 * @param {Element & ElementCSSInlineStyle} node
	 * @param {import('./private.js').PositionRect} from
	 * @param {import('./private.js').AnimationFn} fn
	 */
	function create_animation(node, from, fn, params) {
		if (!from) return noop$3;
		const to = node.getBoundingClientRect();
		if (
			from.left === to.left &&
			from.right === to.right &&
			from.top === to.top &&
			from.bottom === to.bottom
		)
			return noop$3;
		const {
			delay = 0,
			duration = 300,
			easing = identity,
			// @ts-ignore todo: should this be separated from destructuring? Or start/end added to public api and documentation?
			start: start_time = now() + delay,
			// @ts-ignore todo:
			end = start_time + duration,
			tick = noop$3,
			css
		} = fn(node, { from, to }, params);
		let running = true;
		let started = false;
		let name;
		/** @returns {void} */
		function start() {
			if (css) {
				name = create_rule(node, 0, 1, duration, delay, easing, css);
			}
			if (!delay) {
				started = true;
			}
		}
		/** @returns {void} */
		function stop() {
			if (css) delete_rule(node, name);
			running = false;
		}
		loop((now) => {
			if (!started && now >= start_time) {
				started = true;
			}
			if (started && now >= end) {
				tick(1, 0);
				stop();
			}
			if (!running) {
				return false;
			}
			if (started) {
				const p = now - start_time;
				const t = 0 + 1 * easing(p / duration);
				tick(t, 1 - t);
			}
			return true;
		});
		start();
		tick(0, 1);
		return stop;
	}

	/**
	 * @param {Element & ElementCSSInlineStyle} node
	 * @returns {void}
	 */
	function fix_position(node) {
		const style = getComputedStyle(node);
		if (style.position !== 'absolute' && style.position !== 'fixed') {
			const { width, height } = style;
			const a = node.getBoundingClientRect();
			node.style.position = 'absolute';
			node.style.width = width;
			node.style.height = height;
			add_transform(node, a);
		}
	}

	/**
	 * @param {Element & ElementCSSInlineStyle} node
	 * @param {import('./private.js').PositionRect} a
	 * @returns {void}
	 */
	function add_transform(node, a) {
		const b = node.getBoundingClientRect();
		if (a.left !== b.left || a.top !== b.top) {
			const style = getComputedStyle(node);
			const transform = style.transform === 'none' ? '' : style.transform;
			node.style.transform = `${transform} translate(${a.left - b.left}px, ${a.top - b.top}px)`;
		}
	}

	let current_component;

	/** @returns {void} */
	function set_current_component(component) {
		current_component = component;
	}

	function get_current_component() {
		if (!current_component) throw new Error('Function called outside component initialization');
		return current_component;
	}

	/**
	 * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
	 * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
	 * it can be called from an external module).
	 *
	 * If a function is returned _synchronously_ from `onMount`, it will be called when the component is unmounted.
	 *
	 * `onMount` does not run inside a [server-side component](https://svelte.dev/docs#run-time-server-side-component-api).
	 *
	 * https://svelte.dev/docs/svelte#onmount
	 * @template T
	 * @param {() => import('./private.js').NotFunction<T> | Promise<import('./private.js').NotFunction<T>> | (() => any)} fn
	 * @returns {void}
	 */
	function onMount(fn) {
		get_current_component().$$.on_mount.push(fn);
	}

	/**
	 * Schedules a callback to run immediately before the component is unmounted.
	 *
	 * Out of `onMount`, `beforeUpdate`, `afterUpdate` and `onDestroy`, this is the
	 * only one that runs inside a server-side component.
	 *
	 * https://svelte.dev/docs/svelte#ondestroy
	 * @param {() => any} fn
	 * @returns {void}
	 */
	function onDestroy(fn) {
		get_current_component().$$.on_destroy.push(fn);
	}

	/**
	 * Creates an event dispatcher that can be used to dispatch [component events](https://svelte.dev/docs#template-syntax-component-directives-on-eventname).
	 * Event dispatchers are functions that can take two arguments: `name` and `detail`.
	 *
	 * Component events created with `createEventDispatcher` create a
	 * [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
	 * These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
	 * The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
	 * property and can contain any type of data.
	 *
	 * The event dispatcher can be typed to narrow the allowed event names and the type of the `detail` argument:
	 * ```ts
	 * const dispatch = createEventDispatcher<{
	 *  loaded: never; // does not take a detail argument
	 *  change: string; // takes a detail argument of type string, which is required
	 *  optional: number | null; // takes an optional detail argument of type number
	 * }>();
	 * ```
	 *
	 * https://svelte.dev/docs/svelte#createeventdispatcher
	 * @template {Record<string, any>} [EventMap=any]
	 * @returns {import('./public.js').EventDispatcher<EventMap>}
	 */
	function createEventDispatcher() {
		const component = get_current_component();
		return (type, detail, { cancelable = false } = {}) => {
			const callbacks = component.$$.callbacks[type];
			if (callbacks) {
				// TODO are there situations where events could be dispatched
				// in a server (non-DOM) environment?
				const event = custom_event(/** @type {string} */ (type), detail, { cancelable });
				callbacks.slice().forEach((fn) => {
					fn.call(component, event);
				});
				return !event.defaultPrevented;
			}
			return true;
		};
	}

	const dirty_components = [];
	const binding_callbacks = [];

	let render_callbacks = [];

	const flush_callbacks = [];

	const resolved_promise = /* @__PURE__ */ Promise.resolve();

	let update_scheduled = false;

	/** @returns {void} */
	function schedule_update() {
		if (!update_scheduled) {
			update_scheduled = true;
			resolved_promise.then(flush);
		}
	}

	/** @returns {void} */
	function add_render_callback(fn) {
		render_callbacks.push(fn);
	}

	/** @returns {void} */
	function add_flush_callback(fn) {
		flush_callbacks.push(fn);
	}

	// flush() calls callbacks in this order:
	// 1. All beforeUpdate callbacks, in order: parents before children
	// 2. All bind:this callbacks, in reverse order: children before parents.
	// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
	//    for afterUpdates called during the initial onMount, which are called in
	//    reverse order: children before parents.
	// Since callbacks might update component values, which could trigger another
	// call to flush(), the following steps guard against this:
	// 1. During beforeUpdate, any updated components will be added to the
	//    dirty_components array and will cause a reentrant call to flush(). Because
	//    the flush index is kept outside the function, the reentrant call will pick
	//    up where the earlier call left off and go through all dirty components. The
	//    current_component value is saved and restored so that the reentrant call will
	//    not interfere with the "parent" flush() call.
	// 2. bind:this callbacks cannot trigger new flush() calls.
	// 3. During afterUpdate, any updated components will NOT have their afterUpdate
	//    callback called a second time; the seen_callbacks set, outside the flush()
	//    function, guarantees this behavior.
	const seen_callbacks = new Set();

	let flushidx = 0; // Do *not* move this inside the flush() function

	/** @returns {void} */
	function flush() {
		// Do not reenter flush while dirty components are updated, as this can
		// result in an infinite loop. Instead, let the inner flush handle it.
		// Reentrancy is ok afterwards for bindings etc.
		if (flushidx !== 0) {
			return;
		}
		const saved_component = current_component;
		do {
			// first, call beforeUpdate functions
			// and update components
			try {
				while (flushidx < dirty_components.length) {
					const component = dirty_components[flushidx];
					flushidx++;
					set_current_component(component);
					update(component.$$);
				}
			} catch (e) {
				// reset dirty state to not end up in a deadlocked state and then rethrow
				dirty_components.length = 0;
				flushidx = 0;
				throw e;
			}
			set_current_component(null);
			dirty_components.length = 0;
			flushidx = 0;
			while (binding_callbacks.length) binding_callbacks.pop()();
			// then, once components are updated, call
			// afterUpdate functions. This may cause
			// subsequent updates...
			for (let i = 0; i < render_callbacks.length; i += 1) {
				const callback = render_callbacks[i];
				if (!seen_callbacks.has(callback)) {
					// ...so guard against infinite loops
					seen_callbacks.add(callback);
					callback();
				}
			}
			render_callbacks.length = 0;
		} while (dirty_components.length);
		while (flush_callbacks.length) {
			flush_callbacks.pop()();
		}
		update_scheduled = false;
		seen_callbacks.clear();
		set_current_component(saved_component);
	}

	/** @returns {void} */
	function update($$) {
		if ($$.fragment !== null) {
			$$.update();
			run_all($$.before_update);
			const dirty = $$.dirty;
			$$.dirty = [-1];
			$$.fragment && $$.fragment.p($$.ctx, dirty);
			$$.after_update.forEach(add_render_callback);
		}
	}

	/**
	 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
	 * @param {Function[]} fns
	 * @returns {void}
	 */
	function flush_render_callbacks(fns) {
		const filtered = [];
		const targets = [];
		render_callbacks.forEach((c) => (fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c)));
		targets.forEach((c) => c());
		render_callbacks = filtered;
	}

	/**
	 * @type {Promise<void> | null}
	 */
	let promise;

	/**
	 * @returns {Promise<void>}
	 */
	function wait() {
		if (!promise) {
			promise = Promise.resolve();
			promise.then(() => {
				promise = null;
			});
		}
		return promise;
	}

	/**
	 * @param {Element} node
	 * @param {INTRO | OUTRO | boolean} direction
	 * @param {'start' | 'end'} kind
	 * @returns {void}
	 */
	function dispatch(node, direction, kind) {
		node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
	}

	const outroing = new Set();

	/**
	 * @type {Outro}
	 */
	let outros;

	/**
	 * @returns {void} */
	function group_outros() {
		outros = {
			r: 0,
			c: [],
			p: outros // parent group
		};
	}

	/**
	 * @returns {void} */
	function check_outros() {
		if (!outros.r) {
			run_all(outros.c);
		}
		outros = outros.p;
	}

	/**
	 * @param {import('./private.js').Fragment} block
	 * @param {0 | 1} [local]
	 * @returns {void}
	 */
	function transition_in(block, local) {
		if (block && block.i) {
			outroing.delete(block);
			block.i(local);
		}
	}

	/**
	 * @param {import('./private.js').Fragment} block
	 * @param {0 | 1} local
	 * @param {0 | 1} [detach]
	 * @param {() => void} [callback]
	 * @returns {void}
	 */
	function transition_out(block, local, detach, callback) {
		if (block && block.o) {
			if (outroing.has(block)) return;
			outroing.add(block);
			outros.c.push(() => {
				outroing.delete(block);
				if (callback) {
					if (detach) block.d(1);
					callback();
				}
			});
			block.o(local);
		} else if (callback) {
			callback();
		}
	}

	/**
	 * @type {import('../transition/public.js').TransitionConfig}
	 */
	const null_transition = { duration: 0 };

	/**
	 * @param {Element & ElementCSSInlineStyle} node
	 * @param {TransitionFn} fn
	 * @param {any} params
	 * @returns {{ start(): void; invalidate(): void; end(): void; }}
	 */
	function create_in_transition(node, fn, params) {
		/**
		 * @type {TransitionOptions} */
		const options = { direction: 'in' };
		let config = fn(node, params, options);
		let running = false;
		let animation_name;
		let task;
		let uid = 0;

		/**
		 * @returns {void} */
		function cleanup() {
			if (animation_name) delete_rule(node, animation_name);
		}

		/**
		 * @returns {void} */
		function go() {
			const {
				delay = 0,
				duration = 300,
				easing = identity,
				tick = noop$3,
				css
			} = config || null_transition;
			if (css) animation_name = create_rule(node, 0, 1, duration, delay, easing, css, uid++);
			tick(0, 1);
			const start_time = now() + delay;
			const end_time = start_time + duration;
			if (task) task.abort();
			running = true;
			add_render_callback(() => dispatch(node, true, 'start'));
			task = loop((now) => {
				if (running) {
					if (now >= end_time) {
						tick(1, 0);
						dispatch(node, true, 'end');
						cleanup();
						return (running = false);
					}
					if (now >= start_time) {
						const t = easing((now - start_time) / duration);
						tick(t, 1 - t);
					}
				}
				return running;
			});
		}
		let started = false;
		return {
			start() {
				if (started) return;
				started = true;
				delete_rule(node);
				if (is_function(config)) {
					config = config(options);
					wait().then(go);
				} else {
					go();
				}
			},
			invalidate() {
				started = false;
			},
			end() {
				if (running) {
					cleanup();
					running = false;
				}
			}
		};
	}

	/**
	 * @param {Element & ElementCSSInlineStyle} node
	 * @param {TransitionFn} fn
	 * @param {any} params
	 * @returns {{ end(reset: any): void; }}
	 */
	function create_out_transition(node, fn, params) {
		/** @type {TransitionOptions} */
		const options = { direction: 'out' };
		let config = fn(node, params, options);
		let running = true;
		let animation_name;
		const group = outros;
		group.r += 1;
		/** @type {boolean} */
		let original_inert_value;

		/**
		 * @returns {void} */
		function go() {
			const {
				delay = 0,
				duration = 300,
				easing = identity,
				tick = noop$3,
				css
			} = config || null_transition;

			if (css) animation_name = create_rule(node, 1, 0, duration, delay, easing, css);

			const start_time = now() + delay;
			const end_time = start_time + duration;
			add_render_callback(() => dispatch(node, false, 'start'));

			if ('inert' in node) {
				original_inert_value = /** @type {HTMLElement} */ (node).inert;
				node.inert = true;
			}

			loop((now) => {
				if (running) {
					if (now >= end_time) {
						tick(0, 1);
						dispatch(node, false, 'end');
						if (!--group.r) {
							// this will result in `end()` being called,
							// so we don't need to clean up here
							run_all(group.c);
						}
						return false;
					}
					if (now >= start_time) {
						const t = easing((now - start_time) / duration);
						tick(1 - t, t);
					}
				}
				return running;
			});
		}

		if (is_function(config)) {
			wait().then(() => {
				// @ts-ignore
				config = config(options);
				go();
			});
		} else {
			go();
		}

		return {
			end(reset) {
				if (reset && 'inert' in node) {
					node.inert = original_inert_value;
				}
				if (reset && config.tick) {
					config.tick(1, 0);
				}
				if (running) {
					if (animation_name) delete_rule(node, animation_name);
					running = false;
				}
			}
		};
	}

	/** @typedef {1} INTRO */
	/** @typedef {0} OUTRO */
	/** @typedef {{ direction: 'in' | 'out' | 'both' }} TransitionOptions */
	/** @typedef {(node: Element, params: any, options: TransitionOptions) => import('../transition/public.js').TransitionConfig} TransitionFn */

	/**
	 * @typedef {Object} Outro
	 * @property {number} r
	 * @property {Function[]} c
	 * @property {Object} p
	 */

	/**
	 * @typedef {Object} PendingProgram
	 * @property {number} start
	 * @property {INTRO|OUTRO} b
	 * @property {Outro} [group]
	 */

	/**
	 * @typedef {Object} Program
	 * @property {number} a
	 * @property {INTRO|OUTRO} b
	 * @property {1|-1} d
	 * @property {number} duration
	 * @property {number} start
	 * @property {number} end
	 * @property {Outro} [group]
	 */

	// general each functions:

	function ensure_array_like(array_like_or_iterator) {
		return array_like_or_iterator?.length !== undefined
			? array_like_or_iterator
			: Array.from(array_like_or_iterator);
	}

	/** @returns {void} */
	function outro_and_destroy_block(block, lookup) {
		transition_out(block, 1, 1, () => {
			lookup.delete(block.key);
		});
	}

	/** @returns {void} */
	function fix_and_outro_and_destroy_block(block, lookup) {
		block.f();
		outro_and_destroy_block(block, lookup);
	}

	/** @returns {any[]} */
	function update_keyed_each(
		old_blocks,
		dirty,
		get_key,
		dynamic,
		ctx,
		list,
		lookup,
		node,
		destroy,
		create_each_block,
		next,
		get_context
	) {
		let o = old_blocks.length;
		let n = list.length;
		let i = o;
		const old_indexes = {};
		while (i--) old_indexes[old_blocks[i].key] = i;
		const new_blocks = [];
		const new_lookup = new Map();
		const deltas = new Map();
		const updates = [];
		i = n;
		while (i--) {
			const child_ctx = get_context(ctx, list, i);
			const key = get_key(child_ctx);
			let block = lookup.get(key);
			if (!block) {
				block = create_each_block(key, child_ctx);
				block.c();
			} else if (dynamic) {
				// defer updates until all the DOM shuffling is done
				updates.push(() => block.p(child_ctx, dirty));
			}
			new_lookup.set(key, (new_blocks[i] = block));
			if (key in old_indexes) deltas.set(key, Math.abs(i - old_indexes[key]));
		}
		const will_move = new Set();
		const did_move = new Set();
		/** @returns {void} */
		function insert(block) {
			transition_in(block, 1);
			block.m(node, next);
			lookup.set(block.key, block);
			next = block.first;
			n--;
		}
		while (o && n) {
			const new_block = new_blocks[n - 1];
			const old_block = old_blocks[o - 1];
			const new_key = new_block.key;
			const old_key = old_block.key;
			if (new_block === old_block) {
				// do nothing
				next = new_block.first;
				o--;
				n--;
			} else if (!new_lookup.has(old_key)) {
				// remove old block
				destroy(old_block, lookup);
				o--;
			} else if (!lookup.has(new_key) || will_move.has(new_key)) {
				insert(new_block);
			} else if (did_move.has(old_key)) {
				o--;
			} else if (deltas.get(new_key) > deltas.get(old_key)) {
				did_move.add(new_key);
				insert(new_block);
			} else {
				will_move.add(old_key);
				o--;
			}
		}
		while (o--) {
			const old_block = old_blocks[o];
			if (!new_lookup.has(old_block.key)) destroy(old_block, lookup);
		}
		while (n) insert(new_blocks[n - 1]);
		run_all(updates);
		return new_blocks;
	}

	/** @returns {void} */
	function validate_each_keys(ctx, list, get_context, get_key) {
		const keys = new Map();
		for (let i = 0; i < list.length; i++) {
			const key = get_key(get_context(ctx, list, i));
			if (keys.has(key)) {
				let value = '';
				try {
					value = `with value '${String(key)}' `;
				} catch (e) {
					// can't stringify
				}
				throw new Error(
					`Cannot have duplicate keys in a keyed each: Keys at index ${keys.get(
					key
				)} and ${i} ${value}are duplicates`
				);
			}
			keys.set(key, i);
		}
	}

	/** @returns {{}} */
	function get_spread_update(levels, updates) {
		const update = {};
		const to_null_out = {};
		const accounted_for = { $$scope: 1 };
		let i = levels.length;
		while (i--) {
			const o = levels[i];
			const n = updates[i];
			if (n) {
				for (const key in o) {
					if (!(key in n)) to_null_out[key] = 1;
				}
				for (const key in n) {
					if (!accounted_for[key]) {
						update[key] = n[key];
						accounted_for[key] = 1;
					}
				}
				levels[i] = n;
			} else {
				for (const key in o) {
					accounted_for[key] = 1;
				}
			}
		}
		for (const key in to_null_out) {
			if (!(key in update)) update[key] = undefined;
		}
		return update;
	}

	function get_spread_object(spread_props) {
		return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
	}

	/** @returns {void} */
	function bind(component, name, callback) {
		const index = component.$$.props[name];
		if (index !== undefined) {
			component.$$.bound[index] = callback;
			callback(component.$$.ctx[index]);
		}
	}

	/** @returns {void} */
	function create_component(block) {
		block && block.c();
	}

	/** @returns {void} */
	function mount_component(component, target, anchor) {
		const { fragment, after_update } = component.$$;
		fragment && fragment.m(target, anchor);
		// onMount happens before the initial afterUpdate
		add_render_callback(() => {
			const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
			// if the component was destroyed immediately
			// it will update the `$$.on_destroy` reference to `null`.
			// the destructured on_destroy may still reference to the old array
			if (component.$$.on_destroy) {
				component.$$.on_destroy.push(...new_on_destroy);
			} else {
				// Edge case - component was destroyed immediately,
				// most likely as a result of a binding initialising
				run_all(new_on_destroy);
			}
			component.$$.on_mount = [];
		});
		after_update.forEach(add_render_callback);
	}

	/** @returns {void} */
	function destroy_component(component, detaching) {
		const $$ = component.$$;
		if ($$.fragment !== null) {
			flush_render_callbacks($$.after_update);
			run_all($$.on_destroy);
			$$.fragment && $$.fragment.d(detaching);
			// TODO null out other refs, including component.$$ (but need to
			// preserve final state?)
			$$.on_destroy = $$.fragment = null;
			$$.ctx = [];
		}
	}

	/** @returns {void} */
	function make_dirty(component, i) {
		if (component.$$.dirty[0] === -1) {
			dirty_components.push(component);
			schedule_update();
			component.$$.dirty.fill(0);
		}
		component.$$.dirty[(i / 31) | 0] |= 1 << i % 31;
	}

	// TODO: Document the other params
	/**
	 * @param {SvelteComponent} component
	 * @param {import('./public.js').ComponentConstructorOptions} options
	 *
	 * @param {import('./utils.js')['not_equal']} not_equal Used to compare props and state values.
	 * @param {(target: Element | ShadowRoot) => void} [append_styles] Function that appends styles to the DOM when the component is first initialised.
	 * This will be the `add_css` function from the compiled component.
	 *
	 * @returns {void}
	 */
	function init(
		component,
		options,
		instance,
		create_fragment,
		not_equal,
		props,
		append_styles = null,
		dirty = [-1]
	) {
		const parent_component = current_component;
		set_current_component(component);
		/** @type {import('./private.js').T$$} */
		const $$ = (component.$$ = {
			fragment: null,
			ctx: [],
			// state
			props,
			update: noop$3,
			not_equal,
			bound: blank_object(),
			// lifecycle
			on_mount: [],
			on_destroy: [],
			on_disconnect: [],
			before_update: [],
			after_update: [],
			context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
			// everything else
			callbacks: blank_object(),
			dirty,
			skip_bound: false,
			root: options.target || parent_component.$$.root
		});
		append_styles && append_styles($$.root);
		let ready = false;
		$$.ctx = instance
			? instance(component, options.props || {}, (i, ret, ...rest) => {
					const value = rest.length ? rest[0] : ret;
					if ($$.ctx && not_equal($$.ctx[i], ($$.ctx[i] = value))) {
						if (!$$.skip_bound && $$.bound[i]) $$.bound[i](value);
						if (ready) make_dirty(component, i);
					}
					return ret;
			  })
			: [];
		$$.update();
		ready = true;
		run_all($$.before_update);
		// `false` as a special case of no DOM component
		$$.fragment = create_fragment ? create_fragment($$.ctx) : false;
		if (options.target) {
			if (options.hydrate) {
				// TODO: what is the correct type here?
				// @ts-expect-error
				const nodes = children(options.target);
				$$.fragment && $$.fragment.l(nodes);
				nodes.forEach(detach);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				$$.fragment && $$.fragment.c();
			}
			if (options.intro) transition_in(component.$$.fragment);
			mount_component(component, options.target, options.anchor);
			flush();
		}
		set_current_component(parent_component);
	}

	let SvelteElement;

	if (typeof HTMLElement === 'function') {
		SvelteElement = class extends HTMLElement {
			/** The Svelte component constructor */
			$$ctor;
			/** Slots */
			$$s;
			/** The Svelte component instance */
			$$c;
			/** Whether or not the custom element is connected */
			$$cn = false;
			/** Component props data */
			$$d = {};
			/** `true` if currently in the process of reflecting component props back to attributes */
			$$r = false;
			/** @type {Record<string, CustomElementPropDefinition>} Props definition (name, reflected, type etc) */
			$$p_d = {};
			/** @type {Record<string, Function[]>} Event listeners */
			$$l = {};
			/** @type {Map<Function, Function>} Event listener unsubscribe functions */
			$$l_u = new Map();

			constructor($$componentCtor, $$slots, use_shadow_dom) {
				super();
				this.$$ctor = $$componentCtor;
				this.$$s = $$slots;
				if (use_shadow_dom) {
					this.attachShadow({ mode: 'open' });
				}
			}

			addEventListener(type, listener, options) {
				// We can't determine upfront if the event is a custom event or not, so we have to
				// listen to both. If someone uses a custom event with the same name as a regular
				// browser event, this fires twice - we can't avoid that.
				this.$$l[type] = this.$$l[type] || [];
				this.$$l[type].push(listener);
				if (this.$$c) {
					const unsub = this.$$c.$on(type, listener);
					this.$$l_u.set(listener, unsub);
				}
				super.addEventListener(type, listener, options);
			}

			removeEventListener(type, listener, options) {
				super.removeEventListener(type, listener, options);
				if (this.$$c) {
					const unsub = this.$$l_u.get(listener);
					if (unsub) {
						unsub();
						this.$$l_u.delete(listener);
					}
				}
			}

			async connectedCallback() {
				this.$$cn = true;
				if (!this.$$c) {
					// We wait one tick to let possible child slot elements be created/mounted
					await Promise.resolve();
					if (!this.$$cn || this.$$c) {
						return;
					}
					function create_slot(name) {
						return () => {
							let node;
							const obj = {
								c: function create() {
									node = element('slot');
									if (name !== 'default') {
										attr(node, 'name', name);
									}
								},
								/**
								 * @param {HTMLElement} target
								 * @param {HTMLElement} [anchor]
								 */
								m: function mount(target, anchor) {
									insert(target, node, anchor);
								},
								d: function destroy(detaching) {
									if (detaching) {
										detach(node);
									}
								}
							};
							return obj;
						};
					}
					const $$slots = {};
					const existing_slots = get_custom_elements_slots(this);
					for (const name of this.$$s) {
						if (name in existing_slots) {
							$$slots[name] = [create_slot(name)];
						}
					}
					for (const attribute of this.attributes) {
						// this.$$data takes precedence over this.attributes
						const name = this.$$g_p(attribute.name);
						if (!(name in this.$$d)) {
							this.$$d[name] = get_custom_element_value(name, attribute.value, this.$$p_d, 'toProp');
						}
					}
					// Port over props that were set programmatically before ce was initialized
					for (const key in this.$$p_d) {
						if (!(key in this.$$d) && this[key] !== undefined) {
							this.$$d[key] = this[key]; // don't transform, these were set through JavaScript
							delete this[key]; // remove the property that shadows the getter/setter
						}
					}
					this.$$c = new this.$$ctor({
						target: this.shadowRoot || this,
						props: {
							...this.$$d,
							$$slots,
							$$scope: {
								ctx: []
							}
						}
					});

					// Reflect component props as attributes
					const reflect_attributes = () => {
						this.$$r = true;
						for (const key in this.$$p_d) {
							this.$$d[key] = this.$$c.$$.ctx[this.$$c.$$.props[key]];
							if (this.$$p_d[key].reflect) {
								const attribute_value = get_custom_element_value(
									key,
									this.$$d[key],
									this.$$p_d,
									'toAttribute'
								);
								if (attribute_value == null) {
									this.removeAttribute(this.$$p_d[key].attribute || key);
								} else {
									this.setAttribute(this.$$p_d[key].attribute || key, attribute_value);
								}
							}
						}
						this.$$r = false;
					};
					this.$$c.$$.after_update.push(reflect_attributes);
					reflect_attributes(); // once initially because after_update is added too late for first render

					for (const type in this.$$l) {
						for (const listener of this.$$l[type]) {
							const unsub = this.$$c.$on(type, listener);
							this.$$l_u.set(listener, unsub);
						}
					}
					this.$$l = {};
				}
			}

			// We don't need this when working within Svelte code, but for compatibility of people using this outside of Svelte
			// and setting attributes through setAttribute etc, this is helpful
			attributeChangedCallback(attr, _oldValue, newValue) {
				if (this.$$r) return;
				attr = this.$$g_p(attr);
				this.$$d[attr] = get_custom_element_value(attr, newValue, this.$$p_d, 'toProp');
				this.$$c?.$set({ [attr]: this.$$d[attr] });
			}

			disconnectedCallback() {
				this.$$cn = false;
				// In a microtask, because this could be a move within the DOM
				Promise.resolve().then(() => {
					if (!this.$$cn && this.$$c) {
						this.$$c.$destroy();
						this.$$c = undefined;
					}
				});
			}

			$$g_p(attribute_name) {
				return (
					Object.keys(this.$$p_d).find(
						(key) =>
							this.$$p_d[key].attribute === attribute_name ||
							(!this.$$p_d[key].attribute && key.toLowerCase() === attribute_name)
					) || attribute_name
				);
			}
		};
	}

	/**
	 * @param {string} prop
	 * @param {any} value
	 * @param {Record<string, CustomElementPropDefinition>} props_definition
	 * @param {'toAttribute' | 'toProp'} [transform]
	 */
	function get_custom_element_value(prop, value, props_definition, transform) {
		const type = props_definition[prop]?.type;
		value = type === 'Boolean' && typeof value !== 'boolean' ? value != null : value;
		if (!transform || !props_definition[prop]) {
			return value;
		} else if (transform === 'toAttribute') {
			switch (type) {
				case 'Object':
				case 'Array':
					return value == null ? null : JSON.stringify(value);
				case 'Boolean':
					return value ? '' : null;
				case 'Number':
					return value == null ? null : value;
				default:
					return value;
			}
		} else {
			switch (type) {
				case 'Object':
				case 'Array':
					return value && JSON.parse(value);
				case 'Boolean':
					return value; // conversion already handled above
				case 'Number':
					return value != null ? +value : value;
				default:
					return value;
			}
		}
	}

	/**
	 * @internal
	 *
	 * Turn a Svelte component into a custom element.
	 * @param {import('./public.js').ComponentType} Component  A Svelte component constructor
	 * @param {Record<string, CustomElementPropDefinition>} props_definition  The props to observe
	 * @param {string[]} slots  The slots to create
	 * @param {string[]} accessors  Other accessors besides the ones for props the component has
	 * @param {boolean} use_shadow_dom  Whether to use shadow DOM
	 * @param {(ce: new () => HTMLElement) => new () => HTMLElement} [extend]
	 */
	function create_custom_element(
		Component,
		props_definition,
		slots,
		accessors,
		use_shadow_dom,
		extend
	) {
		let Class = class extends SvelteElement {
			constructor() {
				super(Component, slots, use_shadow_dom);
				this.$$p_d = props_definition;
			}
			static get observedAttributes() {
				return Object.keys(props_definition).map((key) =>
					(props_definition[key].attribute || key).toLowerCase()
				);
			}
		};
		Object.keys(props_definition).forEach((prop) => {
			Object.defineProperty(Class.prototype, prop, {
				get() {
					return this.$$c && prop in this.$$c ? this.$$c[prop] : this.$$d[prop];
				},
				set(value) {
					value = get_custom_element_value(prop, value, props_definition);
					this.$$d[prop] = value;
					this.$$c?.$set({ [prop]: value });
				}
			});
		});
		accessors.forEach((accessor) => {
			Object.defineProperty(Class.prototype, accessor, {
				get() {
					return this.$$c?.[accessor];
				}
			});
		});
		if (extend) {
			// @ts-expect-error - assigning here is fine
			Class = extend(Class);
		}
		Component.element = /** @type {any} */ (Class);
		return Class;
	}

	/**
	 * Base class for Svelte components. Used when dev=false.
	 *
	 * @template {Record<string, any>} [Props=any]
	 * @template {Record<string, any>} [Events=any]
	 */
	class SvelteComponent {
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$ = undefined;
		/**
		 * ### PRIVATE API
		 *
		 * Do not use, may change at any time
		 *
		 * @type {any}
		 */
		$$set = undefined;

		/** @returns {void} */
		$destroy() {
			destroy_component(this, 1);
			this.$destroy = noop$3;
		}

		/**
		 * @template {Extract<keyof Events, string>} K
		 * @param {K} type
		 * @param {((e: Events[K]) => void) | null | undefined} callback
		 * @returns {() => void}
		 */
		$on(type, callback) {
			if (!is_function(callback)) {
				return noop$3;
			}
			const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
			callbacks.push(callback);
			return () => {
				const index = callbacks.indexOf(callback);
				if (index !== -1) callbacks.splice(index, 1);
			};
		}

		/**
		 * @param {Partial<Props>} props
		 * @returns {void}
		 */
		$set(props) {
			if (this.$$set && !is_empty(props)) {
				this.$$.skip_bound = true;
				this.$$set(props);
				this.$$.skip_bound = false;
			}
		}
	}

	/**
	 * @typedef {Object} CustomElementPropDefinition
	 * @property {string} [attribute]
	 * @property {boolean} [reflect]
	 * @property {'String'|'Boolean'|'Number'|'Array'|'Object'} [type]
	 */

	// generated during release, do not modify

	/**
	 * The current version, as set in package.json.
	 *
	 * https://svelte.dev/docs/svelte-compiler#svelte-version
	 * @type {string}
	 */
	const VERSION = '4.2.18';
	const PUBLIC_VERSION = '4';

	/**
	 * @template T
	 * @param {string} type
	 * @param {T} [detail]
	 * @returns {void}
	 */
	function dispatch_dev(type, detail) {
		document.dispatchEvent(custom_event(type, { version: VERSION, ...detail }, { bubbles: true }));
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @returns {void}
	 */
	function append_dev(target, node) {
		dispatch_dev('SvelteDOMInsert', { target, node });
		append(target, node);
	}

	/**
	 * @param {Node} target
	 * @param {Node} node
	 * @param {Node} [anchor]
	 * @returns {void}
	 */
	function insert_dev(target, node, anchor) {
		dispatch_dev('SvelteDOMInsert', { target, node, anchor });
		insert(target, node, anchor);
	}

	/**
	 * @param {Node} node
	 * @returns {void}
	 */
	function detach_dev(node) {
		dispatch_dev('SvelteDOMRemove', { node });
		detach(node);
	}

	/**
	 * @param {Node} node
	 * @param {string} event
	 * @param {EventListenerOrEventListenerObject} handler
	 * @param {boolean | AddEventListenerOptions | EventListenerOptions} [options]
	 * @param {boolean} [has_prevent_default]
	 * @param {boolean} [has_stop_propagation]
	 * @param {boolean} [has_stop_immediate_propagation]
	 * @returns {() => void}
	 */
	function listen_dev(
		node,
		event,
		handler,
		options,
		has_prevent_default,
		has_stop_propagation,
		has_stop_immediate_propagation
	) {
		const modifiers =
			options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
		if (has_prevent_default) modifiers.push('preventDefault');
		if (has_stop_propagation) modifiers.push('stopPropagation');
		if (has_stop_immediate_propagation) modifiers.push('stopImmediatePropagation');
		dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
		const dispose = listen(node, event, handler, options);
		return () => {
			dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
			dispose();
		};
	}

	/**
	 * @param {Element} node
	 * @param {string} attribute
	 * @param {string} [value]
	 * @returns {void}
	 */
	function attr_dev(node, attribute, value) {
		attr(node, attribute, value);
		if (value == null) dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
		else dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
	}

	/**
	 * @param {Element} node
	 * @param {string} property
	 * @param {any} [value]
	 * @returns {void}
	 */
	function prop_dev(node, property, value) {
		node[property] = value;
		dispatch_dev('SvelteDOMSetProperty', { node, property, value });
	}

	/**
	 * @param {Text} text
	 * @param {unknown} data
	 * @returns {void}
	 */
	function set_data_dev(text, data) {
		data = '' + data;
		if (text.data === data) return;
		dispatch_dev('SvelteDOMSetData', { node: text, data });
		text.data = /** @type {string} */ (data);
	}

	function ensure_array_like_dev(arg) {
		if (
			typeof arg !== 'string' &&
			!(arg && typeof arg === 'object' && 'length' in arg) &&
			!(typeof Symbol === 'function' && arg && Symbol.iterator in arg)
		) {
			throw new Error('{#each} only works with iterable values.');
		}
		return ensure_array_like(arg);
	}

	/**
	 * @returns {void} */
	function validate_slots(name, slot, keys) {
		for (const slot_key of Object.keys(slot)) {
			if (!~keys.indexOf(slot_key)) {
				console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
			}
		}
	}

	function construct_svelte_component_dev(component, props) {
		const error_message = 'this={...} of <svelte:component> should specify a Svelte component.';
		try {
			const instance = new component(props);
			if (!instance.$$ || !instance.$set || !instance.$on || !instance.$destroy) {
				throw new Error(error_message);
			}
			return instance;
		} catch (err) {
			const { message } = err;
			if (typeof message === 'string' && message.indexOf('is not a constructor') !== -1) {
				throw new Error(error_message);
			} else {
				throw err;
			}
		}
	}

	/**
	 * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
	 *
	 * Can be used to create strongly typed Svelte components.
	 *
	 * #### Example:
	 *
	 * You have component library on npm called `component-library`, from which
	 * you export a component called `MyComponent`. For Svelte+TypeScript users,
	 * you want to provide typings. Therefore you create a `index.d.ts`:
	 * ```ts
	 * import { SvelteComponent } from "svelte";
	 * export class MyComponent extends SvelteComponent<{foo: string}> {}
	 * ```
	 * Typing this makes it possible for IDEs like VS Code with the Svelte extension
	 * to provide intellisense and to use the component like this in a Svelte file
	 * with TypeScript:
	 * ```svelte
	 * <script lang="ts">
	 * 	import { MyComponent } from "component-library";
	 * </script>
	 * <MyComponent foo={'bar'} />
	 * ```
	 * @template {Record<string, any>} [Props=any]
	 * @template {Record<string, any>} [Events=any]
	 * @template {Record<string, any>} [Slots=any]
	 * @extends {SvelteComponent<Props, Events>}
	 */
	class SvelteComponentDev extends SvelteComponent {
		/**
		 * For type checking capabilities only.
		 * Does not exist at runtime.
		 * ### DO NOT USE!
		 *
		 * @type {Props}
		 */
		$$prop_def;
		/**
		 * For type checking capabilities only.
		 * Does not exist at runtime.
		 * ### DO NOT USE!
		 *
		 * @type {Events}
		 */
		$$events_def;
		/**
		 * For type checking capabilities only.
		 * Does not exist at runtime.
		 * ### DO NOT USE!
		 *
		 * @type {Slots}
		 */
		$$slot_def;

		/** @param {import('./public.js').ComponentConstructorOptions<Props>} options */
		constructor(options) {
			if (!options || (!options.target && !options.$$inline)) {
				throw new Error("'target' is a required option");
			}
			super();
		}

		/** @returns {void} */
		$destroy() {
			super.$destroy();
			this.$destroy = () => {
				console.warn('Component was already destroyed'); // eslint-disable-line no-console
			};
		}

		/** @returns {void} */
		$capture_state() {}

		/** @returns {void} */
		$inject_state() {}
	}

	if (typeof window !== 'undefined')
		// @ts-ignore
		(window.__svelte || (window.__svelte = { v: new Set() })).v.add(PUBLIC_VERSION);

	const subscriber_queue = [];

	/**
	 * Create a `Writable` store that allows both updating and reading by subscription.
	 *
	 * https://svelte.dev/docs/svelte-store#writable
	 * @template T
	 * @param {T} [value] initial value
	 * @param {import('./public.js').StartStopNotifier<T>} [start]
	 * @returns {import('./public.js').Writable<T>}
	 */
	function writable(value, start = noop$3) {
		/** @type {import('./public.js').Unsubscriber} */
		let stop;
		/** @type {Set<import('./private.js').SubscribeInvalidateTuple<T>>} */
		const subscribers = new Set();
		/** @param {T} new_value
		 * @returns {void}
		 */
		function set(new_value) {
			if (safe_not_equal(value, new_value)) {
				value = new_value;
				if (stop) {
					// store is ready
					const run_queue = !subscriber_queue.length;
					for (const subscriber of subscribers) {
						subscriber[1]();
						subscriber_queue.push(subscriber, value);
					}
					if (run_queue) {
						for (let i = 0; i < subscriber_queue.length; i += 2) {
							subscriber_queue[i][0](subscriber_queue[i + 1]);
						}
						subscriber_queue.length = 0;
					}
				}
			}
		}

		/**
		 * @param {import('./public.js').Updater<T>} fn
		 * @returns {void}
		 */
		function update(fn) {
			set(fn(value));
		}

		/**
		 * @param {import('./public.js').Subscriber<T>} run
		 * @param {import('./private.js').Invalidator<T>} [invalidate]
		 * @returns {import('./public.js').Unsubscriber}
		 */
		function subscribe(run, invalidate = noop$3) {
			/** @type {import('./private.js').SubscribeInvalidateTuple<T>} */
			const subscriber = [run, invalidate];
			subscribers.add(subscriber);
			if (subscribers.size === 1) {
				stop = start(set, update) || noop$3;
			}
			run(value);
			return () => {
				subscribers.delete(subscriber);
				if (subscribers.size === 0 && stop) {
					stop();
					stop = null;
				}
			};
		}
		return { set, update, subscribe };
	}

	// src/common/api/api.js
	const initApiMap = () => {
	    const api = {
	        // root: 'https://127.0.0.1:8000',
	        root: 'https://192.168.1.228:8001',
	        user: {
	            currentUser: 'usermanagement/users/me/',
	        },
	        sites: {
	            thisSite: (siteRootURL) => `orchestra/config/sites/?internal_url=${siteRootURL}`,
	            sites: (siteId) => siteId ? `orchestra/config/sites/${siteId}/` : 'orchestra/config/sites/',
	            updateFields: (siteId) => `orchestra/config/sites/${siteId}/update-fields/`,
	            paths: (siteId) => `orchestra/config/sites/${siteId}/paths/`,
	            addPath: (siteId) => `orchestra/config/sites/${siteId}/add-path/`,
	            siteTheme: (siteId) => `orchestra/config/sites/${siteId}/site-theme/`,
	            updateSiteTheme: (siteId) => `orchestra/config/sites/${siteId}/update_theme/`,
	            createCustomTheme: (siteId) => `orchestra/config/sites/${siteId}/create_custom_theme/`,
	            addCustomTheme: (siteId) => `orchestra/config/sites/${siteId}/add_custom_theme/`,
	            siteAnalytics: 'orchestra/config/site-analytics/',
	            updateSiteAnalyticsObj: (siteAnalyticsId) => `orchestra/config/site-analytics/${siteAnalyticsId}/`,
	            updateSiteAnalyticsKey: (siteAnalyticsId) => `orchestra/config/site-analytics/${siteAnalyticsId}/update-key/`,
	        },
	        pages: {
	            pages: (pageId) => pageId ? `orchestra/config/pages/${pageId}/` : 'orchestra/config/pages/',
	            updateTitle: (pageId) => `orchestra/config/pages/${pageId}/update-title/`,
	            updateBackground: (pageId) => `orchestra/config/pages/${pageId}/update-background/`,
	        },
	        pageTemplates: {
	            pageTemplates: (pageTemplateId) => pageTemplateId ? `orchestra/config/page-templates/${pageTemplateId}/` : 'orchestra/config/page-templates/',
	        },
	        paths: {
	            thisPath: (siteRootURL, currentPath) => `orchestra/config/paths/this-path/?internal_url=${siteRootURL}&current_path=${currentPath}`,
	            page: (pathId) => `orchestra/config/paths/${pathId}/page/`,
	            paths: (pathId) => pathId ? `orchestra/config/paths/${pathId}/` : 'orchestra/config/paths',
	            updateFlags: (pathId) => `orchestra/config/paths/${pathId}/update-flags/`,
	            updateFrequency: (pathId) => `orchestra/config/paths/${pathId}/update-frequency/`,

	            toggleFeature: (pathId) => `orchestra/config/paths/${pathId}/toggle-feature/`,
	            toggleStylishBox: (pathId) => `orchestra/config/paths/${pathId}/toggle-stylish-box/`,
	            toggleInjectionTarget: (pathId) => `orchestra/config/paths/${pathId}/toggle-injection-target/`,
	            
	            configurations: (pathId) => `orchestra/config/paths/${pathId}/configurations/`,
	        },
	        design: {
	            themes: (themeId) => themeId ? `orchestra/themes/${themeId}/` : 'orchestra/themes/',
	            availableThemes: 'orchestra/themes/available-themes/',
	            updateThemeColor: (themeId) => `orchestra/themes/${themeId}/update-theme-color/`,
	            updateThemeTypography: (themeId) => `orchestra/themes/${themeId}/update-theme-typography/`,
	            addColorPalette: (themeId) => `orchestra/themes/${themeId}/add-palette/`,
	            updateColorPalette: (themeId) => `orchestra/themes/${themeId}/update-palette/`,
	    
	            updateTypography: (typographyId) => `orchestra/typographies/${typographyId}/`,
	            updateSpacing: (spacingId) => `orchestra/spacings/${spacingId}/`,

	        },
	        features: {
	            partners: (partnerId) => partnerId ?  `orchestra/config/partners/${partnerId}/` : 'orchestra/config/partners',
	            libraries: (libraryId) => libraryId ? `orchestra/config/libraries/${libraryId}` : 'orchestra/config/libraries',
	            features: (featureId) => featureId ? `orchestra/config/features/${featureId}/` : 'orchestra/config/features',
	            modules: (moduleId) => moduleId ? `orchestra/config/modules/${moduleId}/` : 'orchestra/config/modules/',
	            components: (componentId) => componentId ? `orchestra/config/components/${componentId}/` : `orchestra/config/components/`,
	            updateComponentsOrder: `orchestra/config/components/update-order/`,
	            externalWidgets: (externalWidgetId) => externalWidgetId ? `orchestra/config/external-widgets/${externalWidgetId}/` : 'orchestra/config/external-widgets/',
	        },
	        injection: {
	            stylishBoxes: (stylishBoxId) => stylishBoxId ? `orchestra/config/stylish-boxes/${stylishBoxId}/` : 'orchestra/config/stylish-boxes',
	            injectionTargets: (injectionTargetId) => injectionTargetId ? `orchestra/config/injection-targets/${injectionTargetId}/` : 'orchestra/config/injection-targets',
	        },
	        seo: {
	            schemaMarkups: (schemaId) => schemaId ? `orchestra/config/seo/schema-markups/${schemaId}/` : 'orchestra/config/seo/schema-markups/',
	            faqs: (faqId) => faqId ? `orchestra/config/seo/faqs/${faqId}/` : 'orchestra/config/seo/faqs/',
	            articles: (articleId) => articleId ? `orchestra/config/seo/articles/${articleId}/` : 'orchestra/config/seo/articles/',
	            products: (productId) => productId ? `orchestra/config/seo/products/${productId}/` : 'orchestra/config/seo/products/',
	            localBusinesses: (localBusinessId) => localBusinessId ? `orchestra/config/seo/local-businesses/${localBusinessId}/` : 'orchestra/config/seo/local-businesses/',
	            events: (eventId) => eventId ? `orchestra/config/seo/events/${eventId}/` : 'orchestra/config/seo/events/',
	            recipes: (recipeId) => recipeId ? `orchestra/config/seo/recipes/${recipeId}/` : 'orchestra/config/seo/recipes/',
	            breadcrumbs: (breadcrumbId) => breadcrumbId ? `orchestra/config/seo/breadcrumbs/${breadcrumbId}/` : 'orchestra/config/seo/breadcrumbs/',
	            reviews: (reviewId) => reviewId ? `orchestra/config/seo/reviews/${reviewId}/` : 'orchestra/config/seo/reviews/',
	            howTos: (howToId) => howToId ? `orchestra/config/seo/how-tos/${howToId}/` : 'orchestra/config/seo/how-tos/',
	            
	            metaTags: 'orchestra/config/seo/meta-tags/',
	            openGraphTags: 'orchestra/config/seo/og-tags/',
	            canonicalTags: 'orchestra/config/seo/canonical-tags/',
	            robotsMetaTags: 'orchestra/config/seo/robots-meta-tags/',
	        },
	        serviceActions: {
	            serviceActions: (serviceActionId) => serviceActionId ? `orchestra/service-actions/${serviceActionId}/` : 'orchestra/service-actions/',
	            dismissedServiceActions: 'orchestra/dismissed-service-actions/',
	        },
	        alerts: {
	            alerts: (alertId) => alertId ? `orchestra/config/alerts/${alertId}/` : `orchestra/config/alerts/`,
	            siteAlerts: (siteId) => `orchestra/config/alerts/site/${siteId}/`,
	            pathAlerts: (siteId, pathId) => `orchestra/config/alerts/site/${siteId}/path/${pathId}/`,
	        },
	        artifacts: {
	            artifactSources: (artifactSourceId) => artifactSourceId ? `artifacts/sources/${artifactSourceId}/` : 'artifacts/sources/',
	            updateArtifactSource: (artifactSourceId) => `artifacts/sources/${artifactSourceId}/`,
	            reportKnownArtifact: `orchestra/config/report-known-artifact/`,
	        },
	        configurations: {
	            configurations: (configurationId) => configurationId ? `orchestra/configurations/${configurationId}/`: 'orchestra/configurations/',
	            decisions: (configurationId) => `orchestra/configurations/${configurationId}/decisions`,
	            updateConfigurationSelections: (configurationId) => `orchestra/configurations/${configurationId}/save-selections/`,
	        },
	        decisions: {
	            decisions: (decisionId) => decisionId ? `orchestra/decisions/${decisionId}/`: 'orchestra/decisions/',
	            options: (decisionId) => `orchestra/decisions/${decisionId}/options/`,
	        },
	        options: {
	            options: (optionId) => optionId ? `orchestra/options/${optionId}/`: 'orchestra/options/',
	            choices: (optionId) => `orchestra/options/${optionId}/choices`,
	        },
	        choices: {
	            choices: (choiceId) => choiceId ? `orchestra/choices/${choiceId}/`: 'orchestra/choices/',
	        },
	        crawler: {
	            crawls: 'webcrawler/crawls/templates',
	            drivers: 'webcrawler/driver-profiles',
	        },
	        tags: {
	            tags: `orchestra/tags/`,
	        },
	        media: {
	            videos: 'orchestra/videos/',
	            images: 'orchestra/images/',
	        },
	        llm: {
	            pipelines: {
	                url: "llm/pipelines/",
	                method: "GET",
	                description: "Get all pipelines"
	            },
	            runPipeline: (pipelineId) => ({
	                url: `llm/pipelines/${pipelineId}/run/`,
	                method: "POST",
	                description: "Run a pipeline"
	            }),
	            modelConfigurations: {
	                url: "llm/model-configurations/",
	                method: "GET",
	                description: "Get all model configurations"
	            },
	            getModelConfiguration: (modelName) => ({
	                url: `llm/model-configurations/${modelName}/`,
	                method: "GET",
	                description: "Get model configuration by name"
	            }),
	            createConversation: {
	                url: "llm/conversations/",
	                method: "POST",
	                description: "Create a conversation"
	            },
	            updateConversation: {
	                url: (convoId) => `llm/conversations/${convoId}/update/`,
	                method: "POST",
	                description: "Create a conversation"
	            },
	            userConversations: {
	                url: "llm/conversations/user/",
	                method: "GET",
	                description: "Get all mock responses"
	            },
	            userPathConversations: {
	                url: (pathId) => `llm/conversations/user/path/${pathId}/`,
	                method: "GET",
	                description: "Get all mock responses"
	            },
	            textCompletionGpt2: {
	                url: "llm/gpt2-text-completion/",
	                method: "POST",
	                description: "GPT2 Text Completion."
	            },
	            generatePromptAndCallHuggingFaceApi: {
	                url: "llm/generate-prompt-and-call-hugging-face-api/",
	                method: "POST",
	                description: "Generate a prompt to be used when calling an LLM endpoint."
	            },
	            generatePrompt: {
	                url: "llm/generate-prompt/",
	                method: "POST",
	                description: "Generate a prompt to be used when calling an LLM endpoint."
	            },
	            pathContentGeneration: {
	                url: "llm/path-content-generation/",
	                method: "POST",
	                description: "Generate path content based on provided config."
	            },

	            // ! In progress
	            mockResponses: {
	                url: "llm/mock-responses/",
	                method: "GET",
	                description: "Get all mock responses"
	            },
	            textCompletion: {
	                url: "llm/text-completion/",
	                method: "POST",
	                description: "Generate text based on the provided prompt."
	            },
	            questionAnswering: {
	                url: "llm/question-answering/",
	                method: "POST",
	                description: "Answer questions based on the provided context."
	            },
	            summarization: {
	                url: "llm/summarization/",
	                method: "POST",
	                description: "Summarize the provided text."
	            },
	            visualInspection: {
	                url: "llm/visual-inspection/",
	                method: "POST",
	                description: "Perform visual inspection of customer sites."
	            },
	            seoRecommendations: {
	                url: "llm/seo-recommendations/",
	                method: "POST",
	                description: "Provide SEO recommendations based on Meta tags."
	            },
	            alertsSummary: {
	                url: "llm/alerts-summary/",
	                method: "POST",
	                description: "Summarize site and path alerts."
	            },
	        },
	        assets: {
	            features: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/features',
	            videos: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/videos',
	            backgrounds: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/backgrounds',
	            logos: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/logos',
	            
	            amenity: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/amenities',
	            architectural_style: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/home_styles',

	            placeholders: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/placeholders',
	            article: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/placeholders',
	            featured_area: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/placeholders',
	            listing: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/placeholders',
	            logo: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/placeholders',
	            agent: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/placeholders',
	            brokerage: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/placeholders',
	            marketing: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/placeholders',
	            advertisement: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/placeholders',
	            misc: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/misc',
	            
	            property_type: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/property_type',
	            fixtures_appliances: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/misc',
	            neighborhood_attributes: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/neighborhood_attributes',
	            area_attributes: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/area_attributes',
	            bedroom_attributes: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/bedroom_attributes',
	            bath_attributes: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/bath_attributes',
	            outdoor_features: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/outdoor_features',
	            travel_transportation: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/travel_transportation',
	            renovation_history_potential: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/renovation_history_potential',
	            investment_potential: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/investment_potential',
	            family_friends_community: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/family_friends_community',
	            nightlife: 'https://u.realgeeks.media/brendansladek-test/sdk/v2/assets/images/options/nightlife',
	        },
	    };

	    return api;
	};

	// src/common/stores/stores.js

	const user = writable(null);

	const api$1 = initApiMap();
	const messageTypes = ['log', 'info', 'warn', 'error'];

	writable(new Set(messageTypes));

	const defaultFeaturedAreas = [
	    { name: "Downtown", image: { ext_src: 'placeholder_featured_area_downtown.png', type: 'featured_area', is_placeholder: false } },
	    { name: "Uptown", image: { ext_src: 'placeholder_featured_area_uptown.png', type: 'featured_area', is_placeholder: false } },
	    { name: "Lakeside", image: { ext_src: 'placeholder_featured_area_lakeside.png', type: 'featured_area', is_placeholder: false } },
	    { name: "Riverside", image: { ext_src: 'placeholder_featured_area_riverside.png', type: 'featured_area', is_placeholder: false } },
	    { name: "Financial District", image: { ext_src: 'placeholder_featured_area_financial_district.png', type: 'featured_area', is_placeholder: false }, city: "CityName" },
	    { name: "Entertainment District", image: { ext_src: 'placeholder_featured_area_entertainment_district.png', type: 'featured_area', is_placeholder: false }, city: "CityName" },
	    { name: "Industrial District", image: { ext_src: 'placeholder_featured_area_industrial_district.png', type: 'featured_area', is_placeholder: false }, city: "CityName" },
	    { name: "Design District", image: { ext_src: 'placeholder_featured_area_design_district.png', type: 'featured_area', is_placeholder: false }, city: "CityName" },
	];

	const defaultListings = [
	    {
	        title: "Beach House",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_beach.png', type: 'listing', is_placeholder: false },
	        address: "100 Beach Blvd",
	        city: "Miami",
	        state: "FL",
	        price: "$500,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    },
	    {
	        title: "Austin",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_austin.png', type: 'listing', is_placeholder: false },
	        address: "200 City St",
	        city: "Austin",
	        state: "TX",
	        price: "$750,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Baltimore",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_baltimore.png', type: 'listing', is_placeholder: false },
	        address: "300 City St",
	        city: "Baltimore",
	        state: "MD",
	        price: "$700,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Boston",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_boston.png', type: 'listing', is_placeholder: false },
	        address: "400 City St",
	        city: "Boston",
	        state: "MA",
	        price: "$800,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Charlotte",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_charlotte.png', type: 'listing', is_placeholder: false },
	        address: "500 City St",
	        city: "Charlotte",
	        state: "NC",
	        price: "$600,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Chicago",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_chicago.png', type: 'listing', is_placeholder: false },
	        address: "600 City St",
	        city: "Chicago",
	        state: "IL",
	        price: "$750,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Cincinnati",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_cinncinnati.png', type: 'listing', is_placeholder: false },
	        address: "700 City St",
	        city: "Cincinnati",
	        state: "OH",
	        price: "$500,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Cleveland 1",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_cleveland_1.png', type: 'listing', is_placeholder: false },
	        address: "800 City St",
	        city: "Cleveland",
	        state: "OH",
	        price: "$600,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Cleveland",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_cleveland.png', type: 'listing', is_placeholder: false },
	        address: "900 City St",
	        city: "Cleveland",
	        state: "OH",
	        price: "$650,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Columbus",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_columbus.png', type: 'listing', is_placeholder: false },
	        address: "1000 City St",
	        city: "Columbus",
	        state: "OH",
	        price: "$700,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Denver",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_denver.png', type: 'listing', is_placeholder: false },
	        address: "1100 City St",
	        city: "Denver",
	        state: "CO",
	        price: "$800,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Detroit",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_detroit.png', type: 'listing', is_placeholder: false },
	        address: "1200 City St",
	        city: "Detroit",
	        state: "MI",
	        price: "$450,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "El Paso",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_el_paso.png', type: 'listing', is_placeholder: false },
	        address: "1300 City St",
	        city: "El Paso",
	        state: "TX",
	        price: "$550,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Fort Worth",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_fort_worth.png', type: 'listing', is_placeholder: false },
	        address: "1400 City St",
	        city: "Fort Worth",
	        state: "TX",
	        price: "$650,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Houston",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_houston.png', type: 'listing', is_placeholder: false },
	        address: "1500 City St",
	        city: "Houston",
	        state: "TX",
	        price: "$850,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Indianapolis",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_indianapolis.png', type: 'listing', is_placeholder: false },
	        address: "1600 City St",
	        city: "Indianapolis",
	        state: "IN",
	        price: "$500,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Jacksonville",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_jacksonville.png', type: 'listing', is_placeholder: false },
	        address: "1700 City St",
	        city: "Jacksonville",
	        state: "FL",
	        price: "$600,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Las Vegas",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_las_vegas.png', type: 'listing', is_placeholder: false },
	        address: "1800 City St",
	        city: "Las Vegas",
	        state: "NV",
	        price: "$700,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Los Angeles",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        // image: { ext_src: 'placeholder_listing_city_los_angeles.png', type: 'listing', is_placeholder: false },
	        address: "1900 City St",
	        city: "Los Angeles",
	        state: "CA",
	        price: "$850,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Louisville",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_louisville.png', type: 'listing', is_placeholder: false },
	        address: "2000 City St",
	        city: "Louisville",
	        state: "KY",
	        price: "$450,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Memphis",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_memphis.png', type: 'listing', is_placeholder: false },
	        address: "2100 City St",
	        city: "Memphis",
	        state: "TN",
	        price: "$550,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Miami",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_miami.png', type: 'listing', is_placeholder: false },
	        address: "2200 City St",
	        city: "Miami",
	        state: "FL",
	        price: "$650,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Milwaukee",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_milwaukee.png', type: 'listing', is_placeholder: false },
	        address: "2300 City St",
	        city: "Milwaukee",
	        state: "WI",
	        price: "$700,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Montreal",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_montreal.png', type: 'listing', is_placeholder: false },
	        address: "2400 City St",
	        city: "Montreal",
	        state: "QC",
	        price: "$750,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Nashville",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_nashville.png', type: 'listing', is_placeholder: false },
	        address: "2500 City St",
	        city: "Nashville",
	        state: "TN",
	        price: "$500,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "New Orleans",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_new_orleans.png', type: 'listing', is_placeholder: false },
	        address: "2600 City St",
	        city: "New Orleans",
	        state: "LA",
	        price: "$650,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "New York",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_new_york_city.png', type: 'listing', is_placeholder: false },
	        address: "2700 City St",
	        city: "New York",
	        state: "NY",
	        price: "$900,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Oklahoma City",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_oklahoma_city.png', type: 'listing', is_placeholder: false },
	        address: "2800 City St",
	        city: "Oklahoma City",
	        state: "OK",
	        price: "$500,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Phoenix",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_phoenix.png', type: 'listing', is_placeholder: false },
	        address: "2900 City St",
	        city: "Phoenix",
	        state: "AZ",
	        price: "$700,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Pittsburgh",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_pittsburgh.png', type: 'listing', is_placeholder: false },
	        address: "3000 City St",
	        city: "Pittsburgh",
	        state: "PA",
	        price: "$600,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Portland",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_portland.png', type: 'listing', is_placeholder: false },
	        address: "3100 City St",
	        city: "Portland",
	        state: "OR",
	        price: "$750,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "San Antonio",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_san_antonio.png', type: 'listing', is_placeholder: false },
	        address: "3200 City St",
	        city: "San Antonio",
	        state: "TX",
	        price: "$550,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "San Francisco",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_san_francisco.png', type: 'listing', is_placeholder: false },
	        address: "3300 City St",
	        city: "San Francisco",
	        state: "CA",
	        price: "$1,000,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "San Jose",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_san_jose.png', type: 'listing', is_placeholder: false },
	        address: "3400 City St",
	        city: "San Jose",
	        state: "CA",
	        price: "$850,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Santa Fe",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_santa_fe.png', type: 'listing', is_placeholder: false },
	        address: "3500 City St",
	        city: "Santa Fe",
	        state: "NM",
	        price: "$600,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Seattle",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_seattle.png', type: 'listing', is_placeholder: false },
	        address: "3600 City St",
	        city: "Seattle",
	        state: "WA",
	        price: "$850,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Toronto",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_toronto.png', type: 'listing', is_placeholder: false },
	        address: "3700 City St",
	        city: "Toronto",
	        state: "ON",
	        price: "$900,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Vancouver",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_vancouver.png', type: 'listing', is_placeholder: false },
	        address: "3800 City St",
	        city: "Vancouver",
	        state: "BC",
	        price: "$950,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Washington DC",
	        description: "2 bed, 1 bath, 800 sq. ft.",
	        image: { ext_src: 'placeholder_listing_city_washington_dc.png', type: 'listing', is_placeholder: false },
	        address: "3900 City St",
	        city: "Washington",
	        state: "DC",
	        price: "$850,000",
	        beds: 2,
	        baths: 1,
	        sqFt: 800
	    },
	    {
	        title: "Forest Cabin",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_forest.png', type: 'listing', is_placeholder: false },
	        address: "100 Forest Rd",
	        city: "Seattle",
	        state: "WA",
	        price: "$550,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    },
	    {
	        title: "Home 1",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_home_1.png', type: 'listing', is_placeholder: false },
	        address: "101 Home St",
	        city: "Dallas",
	        state: "TX",
	        price: "$400,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    },
	    {
	        title: "Home 2",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_home_2.png', type: 'listing', is_placeholder: false },
	        address: "102 Home St",
	        city: "Dallas",
	        state: "TX",
	        price: "$420,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    },
	    {
	        title: "Home 3",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_home_3.png', type: 'listing', is_placeholder: false },
	        address: "103 Home St",
	        city: "Dallas",
	        state: "TX",
	        price: "$430,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    },
	    {
	        title: "Home 4",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_home_4.png', type: 'listing', is_placeholder: false },
	        address: "104 Home St",
	        city: "Dallas",
	        state: "TX",
	        price: "$440,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    },
	    {
	        title: "Home 5",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_home_5.png', type: 'listing', is_placeholder: false },
	        address: "105 Home St",
	        city: "Dallas",
	        state: "TX",
	        price: "$450,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    },
	    {
	        title: "Home 6",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_home_6.png', type: 'listing', is_placeholder: false },
	        address: "106 Home St",
	        city: "Dallas",
	        state: "TX",
	        price: "$460,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    },
	    {
	        title: "Home 7",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_home_7.png', type: 'listing', is_placeholder: false },
	        address: "107 Home St",
	        city: "Dallas",
	        state: "TX",
	        price: "$470,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    },
	    {
	        title: "Home 8",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_home_8.png', type: 'listing', is_placeholder: false },
	        address: "108 Home St",
	        city: "Dallas",
	        state: "TX",
	        price: "$480,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    },
	    {
	        title: "Home 9",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_home_9.png', type: 'listing', is_placeholder: false },
	        address: "109 Home St",
	        city: "Dallas",
	        state: "TX",
	        price: "$490,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    },
	    {
	        title: "Mountain Cabin",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_mountain.png', type: 'listing', is_placeholder: false },
	        address: "110 Mountain Rd",
	        city: "Denver",
	        state: "CO",
	        price: "$600,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    },
	    {
	        title: "Townhouse",
	        description: "3 bed, 2 bath, 1500 sq. ft.",
	        image: { ext_src: 'placeholder_listing_town.png', type: 'listing', is_placeholder: false },
	        address: "111 Town St",
	        city: "San Francisco",
	        state: "CA",
	        price: "$750,000",
	        beds: 3,
	        baths: 2,
	        sqFt: 1500
	    }
	];

	let selectedDevice = writable('full-screen');

	let featuredAreas = writable(defaultFeaturedAreas);

	let listings = writable(defaultListings);
	let selectedListing = writable(get_store_value(listings)[0] || null);
	let maxFeaturedAreas = 6;
	let maxListings = 25;
	let showDetail = writable(false);

	let useNavLogoImage = false;
	let showHeroImage = false;
	let showPopup = writable(false);

	let navLogo = `${api$1.assets.placeholders}/placeholder_logo_home_1.png`;
	let heroImage = null;
	let heroBackgroundImage = `${api$1.assets.placeholders}/placeholder_background_cliffside_mansion.png`;

	let agentImage = `${api$1.assets.placeholders}/placeholder_agent_image_agent_1.png`;
	let brokerageImage = `${api$1.assets.placeholders}/placeholder_logo_home_1.png`;
	let agentActivityImage1 = `${api$1.assets.placeholders}/placeholder_agent_activity_tour_home_1.png`;
	let agentActivityImage2 = `${api$1.assets.placeholders}/placeholder_agent_activity_tour_2.png`;

	let articleImage1 = `${api$1.assets.placeholders}/placeholder_article_grand_opening.png`;
	let articleImage2 = `${api$1.assets.placeholders}/placeholder_article_picnic_overlooking_bay.png`;
	let articleImage3 = `${api$1.assets.placeholders}/placeholder_article_tire_swing.png`;

	let advertisementImage1 = `${api$1.assets.placeholders}/placeholder_advertisement_home_builder.png`;
	let advertisementImage2 = `${api$1.assets.placeholders}/placeholder_advertisement_easy_move.png`;
	let advertisementImage3 = `${api$1.assets.placeholders}/placeholder_advertisement_agent_network.png`;
	let advertisementImage4 = `${api$1.assets.placeholders}/placeholder_advertisement_virtual_tour.png`;

	const video = null;
	const placeholderImage = "https://via.placeholder.com/150";
	const placeholderVideo = "https://www.w3schools.com/html/mov_bbb.mp4";

	let brokerageName = 'Sladek Realty';
	let featuredAreaSection = {
	    city: "Dallas",
	    name: "Featured Areas",
	    description: "Explore the most popular areas in the city."
	};
	let listingsSection = {
	    area: "Lakeside",
	    name: "Local Listings",
	    description: "The latest local listings."
	};

	function togglePopup() {
	    showPopup.update(p => !p);
	}

	function setSelectedDevice(newDevice) {
	    selectedDevice.set(newDevice);
	}

	function selectListing(listing) {
	    selectedListing.set(listing);
	    showDetail.set(true);
	}

	function backToListings() {
	    showDetail.set(false);
	}

	var faMagnifyingGlassLocation = {
	  prefix: 'fas',
	  iconName: 'magnifying-glass-location',
	  icon: [512, 512, ["search-location"], "f689", "M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM288 176c0-44.2-35.8-80-80-80s-80 35.8-80 80c0 48.8 46.5 111.6 68.6 138.6c6 7.3 16.8 7.3 22.7 0c22.1-27 68.6-89.8 68.6-138.6zm-112 0a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"]
	};
	var faSearchLocation = faMagnifyingGlassLocation;
	var faChevronUp = {
	  prefix: 'fas',
	  iconName: 'chevron-up',
	  icon: [512, 512, [], "f077", "M233.4 105.4c12.5-12.5 32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L256 173.3 86.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l192-192z"]
	};
	var faHeart = {
	  prefix: 'fas',
	  iconName: 'heart',
	  icon: [512, 512, [128153, 128154, 128155, 128156, 128420, 129293, 129294, 129505, 9829, 10084, 61578], "f004", "M47.6 300.4L228.3 469.1c7.5 7 17.4 10.9 27.7 10.9s20.2-3.9 27.7-10.9L464.4 300.4c30.4-28.3 47.6-68 47.6-109.5v-5.8c0-69.9-50.5-129.5-119.4-141C347 36.5 300.6 51.4 268 84L256 96 244 84c-32.6-32.6-79-47.5-124.6-39.9C50.5 55.6 0 115.2 0 185.1v5.8c0 41.5 17.2 81.2 47.6 109.5z"]
	};
	var faPhone = {
	  prefix: 'fas',
	  iconName: 'phone',
	  icon: [512, 512, [128222, 128379], "f095", "M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z"]
	};
	var faArrowLeft = {
	  prefix: 'fas',
	  iconName: 'arrow-left',
	  icon: [448, 512, [8592], "f060", "M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"]
	};
	var faEnvelope = {
	  prefix: 'fas',
	  iconName: 'envelope',
	  icon: [512, 512, [128386, 9993, 61443], "f0e0", "M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48H48zM0 176V384c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V176L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"]
	};
	var faChevronDown = {
	  prefix: 'fas',
	  iconName: 'chevron-down',
	  icon: [512, 512, [], "f078", "M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z"]
	};
	var faShareFromSquare = {
	  prefix: 'fas',
	  iconName: 'share-from-square',
	  icon: [576, 512, [61509, "share-square"], "f14d", "M352 224H305.5c-45 0-81.5 36.5-81.5 81.5c0 22.3 10.3 34.3 19.2 40.5c6.8 4.7 12.8 12 12.8 20.3c0 9.8-8 17.8-17.8 17.8h-2.5c-2.4 0-4.8-.4-7.1-1.4C210.8 374.8 128 333.4 128 240c0-79.5 64.5-144 144-144h80V34.7C352 15.5 367.5 0 386.7 0c8.6 0 16.8 3.2 23.2 8.9L548.1 133.3c7.6 6.8 11.9 16.5 11.9 26.7s-4.3 19.9-11.9 26.7l-139 125.1c-5.9 5.3-13.5 8.2-21.4 8.2H384c-17.7 0-32-14.3-32-32V224zM80 96c-8.8 0-16 7.2-16 16V432c0 8.8 7.2 16 16 16H400c8.8 0 16-7.2 16-16V384c0-17.7 14.3-32 32-32s32 14.3 32 32v48c0 44.2-35.8 80-80 80H80c-44.2 0-80-35.8-80-80V112C0 67.8 35.8 32 80 32h48c17.7 0 32 14.3 32 32s-14.3 32-32 32H80z"]
	};
	var faShareSquare = faShareFromSquare;
	var faTablet = {
	  prefix: 'fas',
	  iconName: 'tablet',
	  icon: [448, 512, ["tablet-android"], "f3fb", "M64 0C28.7 0 0 28.7 0 64V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64H64zM176 432h96c8.8 0 16 7.2 16 16s-7.2 16-16 16H176c-8.8 0-16-7.2-16-16s7.2-16 16-16z"]
	};
	var faDesktop = {
	  prefix: 'fas',
	  iconName: 'desktop',
	  icon: [576, 512, [128421, 61704, "desktop-alt"], "f390", "M64 0C28.7 0 0 28.7 0 64V352c0 35.3 28.7 64 64 64H240l-10.7 32H160c-17.7 0-32 14.3-32 32s14.3 32 32 32H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H346.7L336 416H512c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64H64zM512 64V288H64V64H512z"]
	};

	// Get CSS class list from a props object
	function classList(props) {
	  const {
	    beat,
	    fade,
	    beatFade,
	    bounce,
	    shake,
	    flash,
	    spin,
	    spinPulse,
	    spinReverse,
	    pulse,
	    fixedWidth,
	    inverse,
	    border,
	    listItem,
	    flip,
	    size,
	    rotation,
	    pull
	  } = props;

	  // map of CSS class names to properties
	  const classes = {
	    'fa-beat': beat,
	    'fa-fade': fade,
	    'fa-beat-fade': beatFade,
	    'fa-bounce': bounce,
	    'fa-shake': shake,
	    'fa-flash': flash,
	    'fa-spin': spin,
	    'fa-spin-reverse': spinReverse,
	    'fa-spin-pulse': spinPulse,
	    'fa-pulse': pulse,
	    'fa-fw': fixedWidth,
	    'fa-inverse': inverse,
	    'fa-border': border,
	    'fa-li': listItem,
	    'fa-flip': flip === true,
	    'fa-flip-horizontal': flip === 'horizontal' || flip === 'both',
	    'fa-flip-vertical': flip === 'vertical' || flip === 'both',
	    [`fa-${size}`]: typeof size !== 'undefined' && size !== null,
	    [`fa-rotate-${rotation}`]:
	      typeof rotation !== 'undefined' && rotation !== null && rotation !== 0,
	    [`fa-pull-${pull}`]: typeof pull !== 'undefined' && pull !== null,
	    'fa-swap-opacity': props.swapOpacity
	  };

	  // map over all the keys in the classes object
	  // return an array of the keys where the value for the key is not null
	  return Object.keys(classes)
	    .map(key => (classes[key] ? key : null))
	    .filter(key => key)
	}

	// Camelize taken from humps
	// humps is copyright © 2012+ Dom Christie
	// Released under the MIT license.

	// Performant way to determine if object coerces to a number
	function _isNumerical(obj) {
	  obj = obj - 0;

	  // eslint-disable-next-line no-self-compare
	  return obj === obj
	}

	function camelize(string) {
	  if (_isNumerical(string)) {
	    return string
	  }

	  // eslint-disable-next-line no-useless-escape
	  string = string.replace(/[\-_\s]+(.)?/g, function(match, chr) {
	    return chr ? chr.toUpperCase() : ''
	  });

	  // Ensure 1st char is always lowercase
	  return string.substr(0, 1).toLowerCase() + string.substr(1)
	}

	function styleToString(style) {
	  if (typeof style === 'string') {
	    return style
	  }

	  return Object.keys(style).reduce((acc, key) => (
	    acc + key.split(/(?=[A-Z])/).join('-').toLowerCase() + ':' + style[key] + ';'
	  ), '')
	}

	function convert(createElement, element, extraProps = {}) {
	  if (typeof element === 'string') {
	    return element
	  }

	  const children = (element.children || []).map((child) => {
	    return convert(createElement, child)
	  });

	  /* eslint-disable dot-notation */
	  const mixins = Object.keys(element.attributes || {}).reduce(
	    (acc, key) => {
	      const val = element.attributes[key];

	      if (key === 'style') {
	        acc.attrs['style'] = styleToString(val);
	      } else {
	        if (key.indexOf('aria-') === 0 || key.indexOf('data-') === 0) {
	          acc.attrs[key.toLowerCase()] = val;
	        } else {
	          acc.attrs[camelize(key)] = val;
	        }
	      }

	      return acc
	    },
	    { attrs: {} }
	  );

	  /* eslint-enable */

	  return createElement(element.tag, { ...mixins.attrs }, children)
	}

	function ownKeys(object, enumerableOnly) {
	  var keys = Object.keys(object);

	  if (Object.getOwnPropertySymbols) {
	    var symbols = Object.getOwnPropertySymbols(object);
	    enumerableOnly && (symbols = symbols.filter(function (sym) {
	      return Object.getOwnPropertyDescriptor(object, sym).enumerable;
	    })), keys.push.apply(keys, symbols);
	  }

	  return keys;
	}

	function _objectSpread2(target) {
	  for (var i = 1; i < arguments.length; i++) {
	    var source = null != arguments[i] ? arguments[i] : {};
	    i % 2 ? ownKeys(Object(source), !0).forEach(function (key) {
	      _defineProperty(target, key, source[key]);
	    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) {
	      Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
	    });
	  }

	  return target;
	}

	function _typeof(obj) {
	  "@babel/helpers - typeof";

	  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) {
	    return typeof obj;
	  } : function (obj) {
	    return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
	  }, _typeof(obj);
	}

	function _classCallCheck(instance, Constructor) {
	  if (!(instance instanceof Constructor)) {
	    throw new TypeError("Cannot call a class as a function");
	  }
	}

	function _defineProperties(target, props) {
	  for (var i = 0; i < props.length; i++) {
	    var descriptor = props[i];
	    descriptor.enumerable = descriptor.enumerable || false;
	    descriptor.configurable = true;
	    if ("value" in descriptor) descriptor.writable = true;
	    Object.defineProperty(target, descriptor.key, descriptor);
	  }
	}

	function _createClass(Constructor, protoProps, staticProps) {
	  if (protoProps) _defineProperties(Constructor.prototype, protoProps);
	  if (staticProps) _defineProperties(Constructor, staticProps);
	  Object.defineProperty(Constructor, "prototype", {
	    writable: false
	  });
	  return Constructor;
	}

	function _defineProperty(obj, key, value) {
	  if (key in obj) {
	    Object.defineProperty(obj, key, {
	      value: value,
	      enumerable: true,
	      configurable: true,
	      writable: true
	    });
	  } else {
	    obj[key] = value;
	  }

	  return obj;
	}

	function _slicedToArray(arr, i) {
	  return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest();
	}

	function _toConsumableArray(arr) {
	  return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread();
	}

	function _arrayWithoutHoles(arr) {
	  if (Array.isArray(arr)) return _arrayLikeToArray(arr);
	}

	function _arrayWithHoles(arr) {
	  if (Array.isArray(arr)) return arr;
	}

	function _iterableToArray(iter) {
	  if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter);
	}

	function _iterableToArrayLimit(arr, i) {
	  var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"];

	  if (_i == null) return;
	  var _arr = [];
	  var _n = true;
	  var _d = false;

	  var _s, _e;

	  try {
	    for (_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true) {
	      _arr.push(_s.value);

	      if (i && _arr.length === i) break;
	    }
	  } catch (err) {
	    _d = true;
	    _e = err;
	  } finally {
	    try {
	      if (!_n && _i["return"] != null) _i["return"]();
	    } finally {
	      if (_d) throw _e;
	    }
	  }

	  return _arr;
	}

	function _unsupportedIterableToArray(o, minLen) {
	  if (!o) return;
	  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
	  var n = Object.prototype.toString.call(o).slice(8, -1);
	  if (n === "Object" && o.constructor) n = o.constructor.name;
	  if (n === "Map" || n === "Set") return Array.from(o);
	  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
	}

	function _arrayLikeToArray(arr, len) {
	  if (len == null || len > arr.length) len = arr.length;

	  for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];

	  return arr2;
	}

	function _nonIterableSpread() {
	  throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
	}

	function _nonIterableRest() {
	  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
	}

	var noop = function noop() {};

	var _WINDOW = {};
	var _DOCUMENT = {};
	var _MUTATION_OBSERVER = null;
	var _PERFORMANCE = {
	  mark: noop,
	  measure: noop
	};

	try {
	  if (typeof window !== 'undefined') _WINDOW = window;
	  if (typeof document !== 'undefined') _DOCUMENT = document;
	  if (typeof MutationObserver !== 'undefined') _MUTATION_OBSERVER = MutationObserver;
	  if (typeof performance !== 'undefined') _PERFORMANCE = performance;
	} catch (e) {}

	var _ref = _WINDOW.navigator || {},
	    _ref$userAgent = _ref.userAgent,
	    userAgent = _ref$userAgent === void 0 ? '' : _ref$userAgent;
	var WINDOW = _WINDOW;
	var DOCUMENT = _DOCUMENT;
	var MUTATION_OBSERVER = _MUTATION_OBSERVER;
	var PERFORMANCE = _PERFORMANCE;
	!!WINDOW.document;
	var IS_DOM = !!DOCUMENT.documentElement && !!DOCUMENT.head && typeof DOCUMENT.addEventListener === 'function' && typeof DOCUMENT.createElement === 'function';
	var IS_IE = ~userAgent.indexOf('MSIE') || ~userAgent.indexOf('Trident/');

	var _familyProxy, _familyProxy2, _familyProxy3, _familyProxy4, _familyProxy5;

	var NAMESPACE_IDENTIFIER = '___FONT_AWESOME___';
	var UNITS_IN_GRID = 16;
	var DEFAULT_CSS_PREFIX = 'fa';
	var DEFAULT_REPLACEMENT_CLASS = 'svg-inline--fa';
	var DATA_FA_I2SVG = 'data-fa-i2svg';
	var DATA_FA_PSEUDO_ELEMENT = 'data-fa-pseudo-element';
	var DATA_FA_PSEUDO_ELEMENT_PENDING = 'data-fa-pseudo-element-pending';
	var DATA_PREFIX = 'data-prefix';
	var DATA_ICON = 'data-icon';
	var HTML_CLASS_I2SVG_BASE_CLASS = 'fontawesome-i2svg';
	var MUTATION_APPROACH_ASYNC = 'async';
	var TAGNAMES_TO_SKIP_FOR_PSEUDOELEMENTS = ['HTML', 'HEAD', 'STYLE', 'SCRIPT'];
	var PRODUCTION$1 = function () {
	  try {
	    return process.env.NODE_ENV === 'production';
	  } catch (e) {
	    return false;
	  }
	}();
	var FAMILY_CLASSIC = 'classic';
	var FAMILY_SHARP = 'sharp';
	var FAMILIES = [FAMILY_CLASSIC, FAMILY_SHARP];

	function familyProxy(obj) {
	  // Defaults to the classic family if family is not available
	  return new Proxy(obj, {
	    get: function get(target, prop) {
	      return prop in target ? target[prop] : target[FAMILY_CLASSIC];
	    }
	  });
	}
	var PREFIX_TO_STYLE = familyProxy((_familyProxy = {}, _defineProperty(_familyProxy, FAMILY_CLASSIC, {
	  'fa': 'solid',
	  'fas': 'solid',
	  'fa-solid': 'solid',
	  'far': 'regular',
	  'fa-regular': 'regular',
	  'fal': 'light',
	  'fa-light': 'light',
	  'fat': 'thin',
	  'fa-thin': 'thin',
	  'fad': 'duotone',
	  'fa-duotone': 'duotone',
	  'fab': 'brands',
	  'fa-brands': 'brands',
	  'fak': 'kit',
	  'fakd': 'kit',
	  'fa-kit': 'kit',
	  'fa-kit-duotone': 'kit'
	}), _defineProperty(_familyProxy, FAMILY_SHARP, {
	  'fa': 'solid',
	  'fass': 'solid',
	  'fa-solid': 'solid',
	  'fasr': 'regular',
	  'fa-regular': 'regular',
	  'fasl': 'light',
	  'fa-light': 'light',
	  'fast': 'thin',
	  'fa-thin': 'thin'
	}), _familyProxy));
	var STYLE_TO_PREFIX = familyProxy((_familyProxy2 = {}, _defineProperty(_familyProxy2, FAMILY_CLASSIC, {
	  solid: 'fas',
	  regular: 'far',
	  light: 'fal',
	  thin: 'fat',
	  duotone: 'fad',
	  brands: 'fab',
	  kit: 'fak'
	}), _defineProperty(_familyProxy2, FAMILY_SHARP, {
	  solid: 'fass',
	  regular: 'fasr',
	  light: 'fasl',
	  thin: 'fast'
	}), _familyProxy2));
	var PREFIX_TO_LONG_STYLE = familyProxy((_familyProxy3 = {}, _defineProperty(_familyProxy3, FAMILY_CLASSIC, {
	  fab: 'fa-brands',
	  fad: 'fa-duotone',
	  fak: 'fa-kit',
	  fal: 'fa-light',
	  far: 'fa-regular',
	  fas: 'fa-solid',
	  fat: 'fa-thin'
	}), _defineProperty(_familyProxy3, FAMILY_SHARP, {
	  fass: 'fa-solid',
	  fasr: 'fa-regular',
	  fasl: 'fa-light',
	  fast: 'fa-thin'
	}), _familyProxy3));
	var LONG_STYLE_TO_PREFIX = familyProxy((_familyProxy4 = {}, _defineProperty(_familyProxy4, FAMILY_CLASSIC, {
	  'fa-brands': 'fab',
	  'fa-duotone': 'fad',
	  'fa-kit': 'fak',
	  'fa-light': 'fal',
	  'fa-regular': 'far',
	  'fa-solid': 'fas',
	  'fa-thin': 'fat'
	}), _defineProperty(_familyProxy4, FAMILY_SHARP, {
	  'fa-solid': 'fass',
	  'fa-regular': 'fasr',
	  'fa-light': 'fasl',
	  'fa-thin': 'fast'
	}), _familyProxy4));
	var ICON_SELECTION_SYNTAX_PATTERN = /fa(s|r|l|t|d|b|k|ss|sr|sl|st)?[\-\ ]/; // eslint-disable-line no-useless-escape

	var LAYERS_TEXT_CLASSNAME = 'fa-layers-text';
	var FONT_FAMILY_PATTERN = /Font ?Awesome ?([56 ]*)(Solid|Regular|Light|Thin|Duotone|Brands|Free|Pro|Sharp|Kit)?.*/i;
	var FONT_WEIGHT_TO_PREFIX = familyProxy((_familyProxy5 = {}, _defineProperty(_familyProxy5, FAMILY_CLASSIC, {
	  900: 'fas',
	  400: 'far',
	  normal: 'far',
	  300: 'fal',
	  100: 'fat'
	}), _defineProperty(_familyProxy5, FAMILY_SHARP, {
	  900: 'fass',
	  400: 'fasr',
	  300: 'fasl',
	  100: 'fast'
	}), _familyProxy5));
	var oneToTen = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
	var oneToTwenty = oneToTen.concat([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
	var ATTRIBUTES_WATCHED_FOR_MUTATION = ['class', 'data-prefix', 'data-icon', 'data-fa-transform', 'data-fa-mask'];
	var DUOTONE_CLASSES = {
	  GROUP: 'duotone-group',
	  SWAP_OPACITY: 'swap-opacity',
	  PRIMARY: 'primary',
	  SECONDARY: 'secondary'
	};
	var prefixes = new Set();
	Object.keys(STYLE_TO_PREFIX[FAMILY_CLASSIC]).map(prefixes.add.bind(prefixes));
	Object.keys(STYLE_TO_PREFIX[FAMILY_SHARP]).map(prefixes.add.bind(prefixes));
	var RESERVED_CLASSES = [].concat(FAMILIES, _toConsumableArray(prefixes), ['2xs', 'xs', 'sm', 'lg', 'xl', '2xl', 'beat', 'border', 'fade', 'beat-fade', 'bounce', 'flip-both', 'flip-horizontal', 'flip-vertical', 'flip', 'fw', 'inverse', 'layers-counter', 'layers-text', 'layers', 'li', 'pull-left', 'pull-right', 'pulse', 'rotate-180', 'rotate-270', 'rotate-90', 'rotate-by', 'shake', 'spin-pulse', 'spin-reverse', 'spin', 'stack-1x', 'stack-2x', 'stack', 'ul', DUOTONE_CLASSES.GROUP, DUOTONE_CLASSES.SWAP_OPACITY, DUOTONE_CLASSES.PRIMARY, DUOTONE_CLASSES.SECONDARY]).concat(oneToTen.map(function (n) {
	  return "".concat(n, "x");
	})).concat(oneToTwenty.map(function (n) {
	  return "w-".concat(n);
	}));

	var initial = WINDOW.FontAwesomeConfig || {};

	function getAttrConfig(attr) {
	  var element = DOCUMENT.querySelector('script[' + attr + ']');

	  if (element) {
	    return element.getAttribute(attr);
	  }
	}

	function coerce(val) {
	  // Getting an empty string will occur if the attribute is set on the HTML tag but without a value
	  // We'll assume that this is an indication that it should be toggled to true
	  if (val === '') return true;
	  if (val === 'false') return false;
	  if (val === 'true') return true;
	  return val;
	}

	if (DOCUMENT && typeof DOCUMENT.querySelector === 'function') {
	  var attrs = [['data-family-prefix', 'familyPrefix'], ['data-css-prefix', 'cssPrefix'], ['data-family-default', 'familyDefault'], ['data-style-default', 'styleDefault'], ['data-replacement-class', 'replacementClass'], ['data-auto-replace-svg', 'autoReplaceSvg'], ['data-auto-add-css', 'autoAddCss'], ['data-auto-a11y', 'autoA11y'], ['data-search-pseudo-elements', 'searchPseudoElements'], ['data-observe-mutations', 'observeMutations'], ['data-mutate-approach', 'mutateApproach'], ['data-keep-original-source', 'keepOriginalSource'], ['data-measure-performance', 'measurePerformance'], ['data-show-missing-icons', 'showMissingIcons']];
	  attrs.forEach(function (_ref) {
	    var _ref2 = _slicedToArray(_ref, 2),
	        attr = _ref2[0],
	        key = _ref2[1];

	    var val = coerce(getAttrConfig(attr));

	    if (val !== undefined && val !== null) {
	      initial[key] = val;
	    }
	  });
	}

	var _default = {
	  styleDefault: 'solid',
	  familyDefault: 'classic',
	  cssPrefix: DEFAULT_CSS_PREFIX,
	  replacementClass: DEFAULT_REPLACEMENT_CLASS,
	  autoReplaceSvg: true,
	  autoAddCss: true,
	  autoA11y: true,
	  searchPseudoElements: false,
	  observeMutations: true,
	  mutateApproach: 'async',
	  keepOriginalSource: true,
	  measurePerformance: false,
	  showMissingIcons: true
	}; // familyPrefix is deprecated but we must still support it if present

	if (initial.familyPrefix) {
	  initial.cssPrefix = initial.familyPrefix;
	}

	var _config = _objectSpread2(_objectSpread2({}, _default), initial);

	if (!_config.autoReplaceSvg) _config.observeMutations = false;
	var config = {};
	Object.keys(_default).forEach(function (key) {
	  Object.defineProperty(config, key, {
	    enumerable: true,
	    set: function set(val) {
	      _config[key] = val;

	      _onChangeCb.forEach(function (cb) {
	        return cb(config);
	      });
	    },
	    get: function get() {
	      return _config[key];
	    }
	  });
	}); // familyPrefix is deprecated as of 6.2.0 and should be removed in 7.0.0

	Object.defineProperty(config, 'familyPrefix', {
	  enumerable: true,
	  set: function set(val) {
	    _config.cssPrefix = val;

	    _onChangeCb.forEach(function (cb) {
	      return cb(config);
	    });
	  },
	  get: function get() {
	    return _config.cssPrefix;
	  }
	});
	WINDOW.FontAwesomeConfig = config;
	var _onChangeCb = [];
	function onChange(cb) {
	  _onChangeCb.push(cb);

	  return function () {
	    _onChangeCb.splice(_onChangeCb.indexOf(cb), 1);
	  };
	}

	var d = UNITS_IN_GRID;
	var meaninglessTransform = {
	  size: 16,
	  x: 0,
	  y: 0,
	  rotate: 0,
	  flipX: false,
	  flipY: false
	};
	function insertCss(css) {
	  if (!css || !IS_DOM) {
	    return;
	  }

	  var style = DOCUMENT.createElement('style');
	  style.setAttribute('type', 'text/css');
	  style.innerHTML = css;
	  var headChildren = DOCUMENT.head.childNodes;
	  var beforeChild = null;

	  for (var i = headChildren.length - 1; i > -1; i--) {
	    var child = headChildren[i];
	    var tagName = (child.tagName || '').toUpperCase();

	    if (['STYLE', 'LINK'].indexOf(tagName) > -1) {
	      beforeChild = child;
	    }
	  }

	  DOCUMENT.head.insertBefore(style, beforeChild);
	  return css;
	}
	var idPool = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	function nextUniqueId() {
	  var size = 12;
	  var id = '';

	  while (size-- > 0) {
	    id += idPool[Math.random() * 62 | 0];
	  }

	  return id;
	}
	function toArray(obj) {
	  var array = [];

	  for (var i = (obj || []).length >>> 0; i--;) {
	    array[i] = obj[i];
	  }

	  return array;
	}
	function classArray(node) {
	  if (node.classList) {
	    return toArray(node.classList);
	  } else {
	    return (node.getAttribute('class') || '').split(' ').filter(function (i) {
	      return i;
	    });
	  }
	}
	function htmlEscape(str) {
	  return "".concat(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}
	function joinAttributes(attributes) {
	  return Object.keys(attributes || {}).reduce(function (acc, attributeName) {
	    return acc + "".concat(attributeName, "=\"").concat(htmlEscape(attributes[attributeName]), "\" ");
	  }, '').trim();
	}
	function joinStyles(styles) {
	  return Object.keys(styles || {}).reduce(function (acc, styleName) {
	    return acc + "".concat(styleName, ": ").concat(styles[styleName].trim(), ";");
	  }, '');
	}
	function transformIsMeaningful(transform) {
	  return transform.size !== meaninglessTransform.size || transform.x !== meaninglessTransform.x || transform.y !== meaninglessTransform.y || transform.rotate !== meaninglessTransform.rotate || transform.flipX || transform.flipY;
	}
	function transformForSvg(_ref) {
	  var transform = _ref.transform,
	      containerWidth = _ref.containerWidth,
	      iconWidth = _ref.iconWidth;
	  var outer = {
	    transform: "translate(".concat(containerWidth / 2, " 256)")
	  };
	  var innerTranslate = "translate(".concat(transform.x * 32, ", ").concat(transform.y * 32, ") ");
	  var innerScale = "scale(".concat(transform.size / 16 * (transform.flipX ? -1 : 1), ", ").concat(transform.size / 16 * (transform.flipY ? -1 : 1), ") ");
	  var innerRotate = "rotate(".concat(transform.rotate, " 0 0)");
	  var inner = {
	    transform: "".concat(innerTranslate, " ").concat(innerScale, " ").concat(innerRotate)
	  };
	  var path = {
	    transform: "translate(".concat(iconWidth / 2 * -1, " -256)")
	  };
	  return {
	    outer: outer,
	    inner: inner,
	    path: path
	  };
	}
	function transformForCss(_ref2) {
	  var transform = _ref2.transform,
	      _ref2$width = _ref2.width,
	      width = _ref2$width === void 0 ? UNITS_IN_GRID : _ref2$width,
	      _ref2$height = _ref2.height,
	      height = _ref2$height === void 0 ? UNITS_IN_GRID : _ref2$height,
	      _ref2$startCentered = _ref2.startCentered,
	      startCentered = _ref2$startCentered === void 0 ? false : _ref2$startCentered;
	  var val = '';

	  if (startCentered && IS_IE) {
	    val += "translate(".concat(transform.x / d - width / 2, "em, ").concat(transform.y / d - height / 2, "em) ");
	  } else if (startCentered) {
	    val += "translate(calc(-50% + ".concat(transform.x / d, "em), calc(-50% + ").concat(transform.y / d, "em)) ");
	  } else {
	    val += "translate(".concat(transform.x / d, "em, ").concat(transform.y / d, "em) ");
	  }

	  val += "scale(".concat(transform.size / d * (transform.flipX ? -1 : 1), ", ").concat(transform.size / d * (transform.flipY ? -1 : 1), ") ");
	  val += "rotate(".concat(transform.rotate, "deg) ");
	  return val;
	}

	var baseStyles = ":root, :host {\n  --fa-font-solid: normal 900 1em/1 \"Font Awesome 6 Solid\";\n  --fa-font-regular: normal 400 1em/1 \"Font Awesome 6 Regular\";\n  --fa-font-light: normal 300 1em/1 \"Font Awesome 6 Light\";\n  --fa-font-thin: normal 100 1em/1 \"Font Awesome 6 Thin\";\n  --fa-font-duotone: normal 900 1em/1 \"Font Awesome 6 Duotone\";\n  --fa-font-sharp-solid: normal 900 1em/1 \"Font Awesome 6 Sharp\";\n  --fa-font-sharp-regular: normal 400 1em/1 \"Font Awesome 6 Sharp\";\n  --fa-font-sharp-light: normal 300 1em/1 \"Font Awesome 6 Sharp\";\n  --fa-font-sharp-thin: normal 100 1em/1 \"Font Awesome 6 Sharp\";\n  --fa-font-brands: normal 400 1em/1 \"Font Awesome 6 Brands\";\n}\n\nsvg:not(:root).svg-inline--fa, svg:not(:host).svg-inline--fa {\n  overflow: visible;\n  box-sizing: content-box;\n}\n\n.svg-inline--fa {\n  display: var(--fa-display, inline-block);\n  height: 1em;\n  overflow: visible;\n  vertical-align: -0.125em;\n}\n.svg-inline--fa.fa-2xs {\n  vertical-align: 0.1em;\n}\n.svg-inline--fa.fa-xs {\n  vertical-align: 0em;\n}\n.svg-inline--fa.fa-sm {\n  vertical-align: -0.0714285705em;\n}\n.svg-inline--fa.fa-lg {\n  vertical-align: -0.2em;\n}\n.svg-inline--fa.fa-xl {\n  vertical-align: -0.25em;\n}\n.svg-inline--fa.fa-2xl {\n  vertical-align: -0.3125em;\n}\n.svg-inline--fa.fa-pull-left {\n  margin-right: var(--fa-pull-margin, 0.3em);\n  width: auto;\n}\n.svg-inline--fa.fa-pull-right {\n  margin-left: var(--fa-pull-margin, 0.3em);\n  width: auto;\n}\n.svg-inline--fa.fa-li {\n  width: var(--fa-li-width, 2em);\n  top: 0.25em;\n}\n.svg-inline--fa.fa-fw {\n  width: var(--fa-fw-width, 1.25em);\n}\n\n.fa-layers svg.svg-inline--fa {\n  bottom: 0;\n  left: 0;\n  margin: auto;\n  position: absolute;\n  right: 0;\n  top: 0;\n}\n\n.fa-layers-counter, .fa-layers-text {\n  display: inline-block;\n  position: absolute;\n  text-align: center;\n}\n\n.fa-layers {\n  display: inline-block;\n  height: 1em;\n  position: relative;\n  text-align: center;\n  vertical-align: -0.125em;\n  width: 1em;\n}\n.fa-layers svg.svg-inline--fa {\n  -webkit-transform-origin: center center;\n          transform-origin: center center;\n}\n\n.fa-layers-text {\n  left: 50%;\n  top: 50%;\n  -webkit-transform: translate(-50%, -50%);\n          transform: translate(-50%, -50%);\n  -webkit-transform-origin: center center;\n          transform-origin: center center;\n}\n\n.fa-layers-counter {\n  background-color: var(--fa-counter-background-color, #ff253a);\n  border-radius: var(--fa-counter-border-radius, 1em);\n  box-sizing: border-box;\n  color: var(--fa-inverse, #fff);\n  line-height: var(--fa-counter-line-height, 1);\n  max-width: var(--fa-counter-max-width, 5em);\n  min-width: var(--fa-counter-min-width, 1.5em);\n  overflow: hidden;\n  padding: var(--fa-counter-padding, 0.25em 0.5em);\n  right: var(--fa-right, 0);\n  text-overflow: ellipsis;\n  top: var(--fa-top, 0);\n  -webkit-transform: scale(var(--fa-counter-scale, 0.25));\n          transform: scale(var(--fa-counter-scale, 0.25));\n  -webkit-transform-origin: top right;\n          transform-origin: top right;\n}\n\n.fa-layers-bottom-right {\n  bottom: var(--fa-bottom, 0);\n  right: var(--fa-right, 0);\n  top: auto;\n  -webkit-transform: scale(var(--fa-layers-scale, 0.25));\n          transform: scale(var(--fa-layers-scale, 0.25));\n  -webkit-transform-origin: bottom right;\n          transform-origin: bottom right;\n}\n\n.fa-layers-bottom-left {\n  bottom: var(--fa-bottom, 0);\n  left: var(--fa-left, 0);\n  right: auto;\n  top: auto;\n  -webkit-transform: scale(var(--fa-layers-scale, 0.25));\n          transform: scale(var(--fa-layers-scale, 0.25));\n  -webkit-transform-origin: bottom left;\n          transform-origin: bottom left;\n}\n\n.fa-layers-top-right {\n  top: var(--fa-top, 0);\n  right: var(--fa-right, 0);\n  -webkit-transform: scale(var(--fa-layers-scale, 0.25));\n          transform: scale(var(--fa-layers-scale, 0.25));\n  -webkit-transform-origin: top right;\n          transform-origin: top right;\n}\n\n.fa-layers-top-left {\n  left: var(--fa-left, 0);\n  right: auto;\n  top: var(--fa-top, 0);\n  -webkit-transform: scale(var(--fa-layers-scale, 0.25));\n          transform: scale(var(--fa-layers-scale, 0.25));\n  -webkit-transform-origin: top left;\n          transform-origin: top left;\n}\n\n.fa-1x {\n  font-size: 1em;\n}\n\n.fa-2x {\n  font-size: 2em;\n}\n\n.fa-3x {\n  font-size: 3em;\n}\n\n.fa-4x {\n  font-size: 4em;\n}\n\n.fa-5x {\n  font-size: 5em;\n}\n\n.fa-6x {\n  font-size: 6em;\n}\n\n.fa-7x {\n  font-size: 7em;\n}\n\n.fa-8x {\n  font-size: 8em;\n}\n\n.fa-9x {\n  font-size: 9em;\n}\n\n.fa-10x {\n  font-size: 10em;\n}\n\n.fa-2xs {\n  font-size: 0.625em;\n  line-height: 0.1em;\n  vertical-align: 0.225em;\n}\n\n.fa-xs {\n  font-size: 0.75em;\n  line-height: 0.0833333337em;\n  vertical-align: 0.125em;\n}\n\n.fa-sm {\n  font-size: 0.875em;\n  line-height: 0.0714285718em;\n  vertical-align: 0.0535714295em;\n}\n\n.fa-lg {\n  font-size: 1.25em;\n  line-height: 0.05em;\n  vertical-align: -0.075em;\n}\n\n.fa-xl {\n  font-size: 1.5em;\n  line-height: 0.0416666682em;\n  vertical-align: -0.125em;\n}\n\n.fa-2xl {\n  font-size: 2em;\n  line-height: 0.03125em;\n  vertical-align: -0.1875em;\n}\n\n.fa-fw {\n  text-align: center;\n  width: 1.25em;\n}\n\n.fa-ul {\n  list-style-type: none;\n  margin-left: var(--fa-li-margin, 2.5em);\n  padding-left: 0;\n}\n.fa-ul > li {\n  position: relative;\n}\n\n.fa-li {\n  left: calc(var(--fa-li-width, 2em) * -1);\n  position: absolute;\n  text-align: center;\n  width: var(--fa-li-width, 2em);\n  line-height: inherit;\n}\n\n.fa-border {\n  border-color: var(--fa-border-color, #eee);\n  border-radius: var(--fa-border-radius, 0.1em);\n  border-style: var(--fa-border-style, solid);\n  border-width: var(--fa-border-width, 0.08em);\n  padding: var(--fa-border-padding, 0.2em 0.25em 0.15em);\n}\n\n.fa-pull-left {\n  float: left;\n  margin-right: var(--fa-pull-margin, 0.3em);\n}\n\n.fa-pull-right {\n  float: right;\n  margin-left: var(--fa-pull-margin, 0.3em);\n}\n\n.fa-beat {\n  -webkit-animation-name: fa-beat;\n          animation-name: fa-beat;\n  -webkit-animation-delay: var(--fa-animation-delay, 0s);\n          animation-delay: var(--fa-animation-delay, 0s);\n  -webkit-animation-direction: var(--fa-animation-direction, normal);\n          animation-direction: var(--fa-animation-direction, normal);\n  -webkit-animation-duration: var(--fa-animation-duration, 1s);\n          animation-duration: var(--fa-animation-duration, 1s);\n  -webkit-animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n          animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n  -webkit-animation-timing-function: var(--fa-animation-timing, ease-in-out);\n          animation-timing-function: var(--fa-animation-timing, ease-in-out);\n}\n\n.fa-bounce {\n  -webkit-animation-name: fa-bounce;\n          animation-name: fa-bounce;\n  -webkit-animation-delay: var(--fa-animation-delay, 0s);\n          animation-delay: var(--fa-animation-delay, 0s);\n  -webkit-animation-direction: var(--fa-animation-direction, normal);\n          animation-direction: var(--fa-animation-direction, normal);\n  -webkit-animation-duration: var(--fa-animation-duration, 1s);\n          animation-duration: var(--fa-animation-duration, 1s);\n  -webkit-animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n          animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n  -webkit-animation-timing-function: var(--fa-animation-timing, cubic-bezier(0.28, 0.84, 0.42, 1));\n          animation-timing-function: var(--fa-animation-timing, cubic-bezier(0.28, 0.84, 0.42, 1));\n}\n\n.fa-fade {\n  -webkit-animation-name: fa-fade;\n          animation-name: fa-fade;\n  -webkit-animation-delay: var(--fa-animation-delay, 0s);\n          animation-delay: var(--fa-animation-delay, 0s);\n  -webkit-animation-direction: var(--fa-animation-direction, normal);\n          animation-direction: var(--fa-animation-direction, normal);\n  -webkit-animation-duration: var(--fa-animation-duration, 1s);\n          animation-duration: var(--fa-animation-duration, 1s);\n  -webkit-animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n          animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n  -webkit-animation-timing-function: var(--fa-animation-timing, cubic-bezier(0.4, 0, 0.6, 1));\n          animation-timing-function: var(--fa-animation-timing, cubic-bezier(0.4, 0, 0.6, 1));\n}\n\n.fa-beat-fade {\n  -webkit-animation-name: fa-beat-fade;\n          animation-name: fa-beat-fade;\n  -webkit-animation-delay: var(--fa-animation-delay, 0s);\n          animation-delay: var(--fa-animation-delay, 0s);\n  -webkit-animation-direction: var(--fa-animation-direction, normal);\n          animation-direction: var(--fa-animation-direction, normal);\n  -webkit-animation-duration: var(--fa-animation-duration, 1s);\n          animation-duration: var(--fa-animation-duration, 1s);\n  -webkit-animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n          animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n  -webkit-animation-timing-function: var(--fa-animation-timing, cubic-bezier(0.4, 0, 0.6, 1));\n          animation-timing-function: var(--fa-animation-timing, cubic-bezier(0.4, 0, 0.6, 1));\n}\n\n.fa-flip {\n  -webkit-animation-name: fa-flip;\n          animation-name: fa-flip;\n  -webkit-animation-delay: var(--fa-animation-delay, 0s);\n          animation-delay: var(--fa-animation-delay, 0s);\n  -webkit-animation-direction: var(--fa-animation-direction, normal);\n          animation-direction: var(--fa-animation-direction, normal);\n  -webkit-animation-duration: var(--fa-animation-duration, 1s);\n          animation-duration: var(--fa-animation-duration, 1s);\n  -webkit-animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n          animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n  -webkit-animation-timing-function: var(--fa-animation-timing, ease-in-out);\n          animation-timing-function: var(--fa-animation-timing, ease-in-out);\n}\n\n.fa-shake {\n  -webkit-animation-name: fa-shake;\n          animation-name: fa-shake;\n  -webkit-animation-delay: var(--fa-animation-delay, 0s);\n          animation-delay: var(--fa-animation-delay, 0s);\n  -webkit-animation-direction: var(--fa-animation-direction, normal);\n          animation-direction: var(--fa-animation-direction, normal);\n  -webkit-animation-duration: var(--fa-animation-duration, 1s);\n          animation-duration: var(--fa-animation-duration, 1s);\n  -webkit-animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n          animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n  -webkit-animation-timing-function: var(--fa-animation-timing, linear);\n          animation-timing-function: var(--fa-animation-timing, linear);\n}\n\n.fa-spin {\n  -webkit-animation-name: fa-spin;\n          animation-name: fa-spin;\n  -webkit-animation-delay: var(--fa-animation-delay, 0s);\n          animation-delay: var(--fa-animation-delay, 0s);\n  -webkit-animation-direction: var(--fa-animation-direction, normal);\n          animation-direction: var(--fa-animation-direction, normal);\n  -webkit-animation-duration: var(--fa-animation-duration, 2s);\n          animation-duration: var(--fa-animation-duration, 2s);\n  -webkit-animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n          animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n  -webkit-animation-timing-function: var(--fa-animation-timing, linear);\n          animation-timing-function: var(--fa-animation-timing, linear);\n}\n\n.fa-spin-reverse {\n  --fa-animation-direction: reverse;\n}\n\n.fa-pulse,\n.fa-spin-pulse {\n  -webkit-animation-name: fa-spin;\n          animation-name: fa-spin;\n  -webkit-animation-direction: var(--fa-animation-direction, normal);\n          animation-direction: var(--fa-animation-direction, normal);\n  -webkit-animation-duration: var(--fa-animation-duration, 1s);\n          animation-duration: var(--fa-animation-duration, 1s);\n  -webkit-animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n          animation-iteration-count: var(--fa-animation-iteration-count, infinite);\n  -webkit-animation-timing-function: var(--fa-animation-timing, steps(8));\n          animation-timing-function: var(--fa-animation-timing, steps(8));\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .fa-beat,\n.fa-bounce,\n.fa-fade,\n.fa-beat-fade,\n.fa-flip,\n.fa-pulse,\n.fa-shake,\n.fa-spin,\n.fa-spin-pulse {\n    -webkit-animation-delay: -1ms;\n            animation-delay: -1ms;\n    -webkit-animation-duration: 1ms;\n            animation-duration: 1ms;\n    -webkit-animation-iteration-count: 1;\n            animation-iteration-count: 1;\n    -webkit-transition-delay: 0s;\n            transition-delay: 0s;\n    -webkit-transition-duration: 0s;\n            transition-duration: 0s;\n  }\n}\n@-webkit-keyframes fa-beat {\n  0%, 90% {\n    -webkit-transform: scale(1);\n            transform: scale(1);\n  }\n  45% {\n    -webkit-transform: scale(var(--fa-beat-scale, 1.25));\n            transform: scale(var(--fa-beat-scale, 1.25));\n  }\n}\n@keyframes fa-beat {\n  0%, 90% {\n    -webkit-transform: scale(1);\n            transform: scale(1);\n  }\n  45% {\n    -webkit-transform: scale(var(--fa-beat-scale, 1.25));\n            transform: scale(var(--fa-beat-scale, 1.25));\n  }\n}\n@-webkit-keyframes fa-bounce {\n  0% {\n    -webkit-transform: scale(1, 1) translateY(0);\n            transform: scale(1, 1) translateY(0);\n  }\n  10% {\n    -webkit-transform: scale(var(--fa-bounce-start-scale-x, 1.1), var(--fa-bounce-start-scale-y, 0.9)) translateY(0);\n            transform: scale(var(--fa-bounce-start-scale-x, 1.1), var(--fa-bounce-start-scale-y, 0.9)) translateY(0);\n  }\n  30% {\n    -webkit-transform: scale(var(--fa-bounce-jump-scale-x, 0.9), var(--fa-bounce-jump-scale-y, 1.1)) translateY(var(--fa-bounce-height, -0.5em));\n            transform: scale(var(--fa-bounce-jump-scale-x, 0.9), var(--fa-bounce-jump-scale-y, 1.1)) translateY(var(--fa-bounce-height, -0.5em));\n  }\n  50% {\n    -webkit-transform: scale(var(--fa-bounce-land-scale-x, 1.05), var(--fa-bounce-land-scale-y, 0.95)) translateY(0);\n            transform: scale(var(--fa-bounce-land-scale-x, 1.05), var(--fa-bounce-land-scale-y, 0.95)) translateY(0);\n  }\n  57% {\n    -webkit-transform: scale(1, 1) translateY(var(--fa-bounce-rebound, -0.125em));\n            transform: scale(1, 1) translateY(var(--fa-bounce-rebound, -0.125em));\n  }\n  64% {\n    -webkit-transform: scale(1, 1) translateY(0);\n            transform: scale(1, 1) translateY(0);\n  }\n  100% {\n    -webkit-transform: scale(1, 1) translateY(0);\n            transform: scale(1, 1) translateY(0);\n  }\n}\n@keyframes fa-bounce {\n  0% {\n    -webkit-transform: scale(1, 1) translateY(0);\n            transform: scale(1, 1) translateY(0);\n  }\n  10% {\n    -webkit-transform: scale(var(--fa-bounce-start-scale-x, 1.1), var(--fa-bounce-start-scale-y, 0.9)) translateY(0);\n            transform: scale(var(--fa-bounce-start-scale-x, 1.1), var(--fa-bounce-start-scale-y, 0.9)) translateY(0);\n  }\n  30% {\n    -webkit-transform: scale(var(--fa-bounce-jump-scale-x, 0.9), var(--fa-bounce-jump-scale-y, 1.1)) translateY(var(--fa-bounce-height, -0.5em));\n            transform: scale(var(--fa-bounce-jump-scale-x, 0.9), var(--fa-bounce-jump-scale-y, 1.1)) translateY(var(--fa-bounce-height, -0.5em));\n  }\n  50% {\n    -webkit-transform: scale(var(--fa-bounce-land-scale-x, 1.05), var(--fa-bounce-land-scale-y, 0.95)) translateY(0);\n            transform: scale(var(--fa-bounce-land-scale-x, 1.05), var(--fa-bounce-land-scale-y, 0.95)) translateY(0);\n  }\n  57% {\n    -webkit-transform: scale(1, 1) translateY(var(--fa-bounce-rebound, -0.125em));\n            transform: scale(1, 1) translateY(var(--fa-bounce-rebound, -0.125em));\n  }\n  64% {\n    -webkit-transform: scale(1, 1) translateY(0);\n            transform: scale(1, 1) translateY(0);\n  }\n  100% {\n    -webkit-transform: scale(1, 1) translateY(0);\n            transform: scale(1, 1) translateY(0);\n  }\n}\n@-webkit-keyframes fa-fade {\n  50% {\n    opacity: var(--fa-fade-opacity, 0.4);\n  }\n}\n@keyframes fa-fade {\n  50% {\n    opacity: var(--fa-fade-opacity, 0.4);\n  }\n}\n@-webkit-keyframes fa-beat-fade {\n  0%, 100% {\n    opacity: var(--fa-beat-fade-opacity, 0.4);\n    -webkit-transform: scale(1);\n            transform: scale(1);\n  }\n  50% {\n    opacity: 1;\n    -webkit-transform: scale(var(--fa-beat-fade-scale, 1.125));\n            transform: scale(var(--fa-beat-fade-scale, 1.125));\n  }\n}\n@keyframes fa-beat-fade {\n  0%, 100% {\n    opacity: var(--fa-beat-fade-opacity, 0.4);\n    -webkit-transform: scale(1);\n            transform: scale(1);\n  }\n  50% {\n    opacity: 1;\n    -webkit-transform: scale(var(--fa-beat-fade-scale, 1.125));\n            transform: scale(var(--fa-beat-fade-scale, 1.125));\n  }\n}\n@-webkit-keyframes fa-flip {\n  50% {\n    -webkit-transform: rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), var(--fa-flip-angle, -180deg));\n            transform: rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), var(--fa-flip-angle, -180deg));\n  }\n}\n@keyframes fa-flip {\n  50% {\n    -webkit-transform: rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), var(--fa-flip-angle, -180deg));\n            transform: rotate3d(var(--fa-flip-x, 0), var(--fa-flip-y, 1), var(--fa-flip-z, 0), var(--fa-flip-angle, -180deg));\n  }\n}\n@-webkit-keyframes fa-shake {\n  0% {\n    -webkit-transform: rotate(-15deg);\n            transform: rotate(-15deg);\n  }\n  4% {\n    -webkit-transform: rotate(15deg);\n            transform: rotate(15deg);\n  }\n  8%, 24% {\n    -webkit-transform: rotate(-18deg);\n            transform: rotate(-18deg);\n  }\n  12%, 28% {\n    -webkit-transform: rotate(18deg);\n            transform: rotate(18deg);\n  }\n  16% {\n    -webkit-transform: rotate(-22deg);\n            transform: rotate(-22deg);\n  }\n  20% {\n    -webkit-transform: rotate(22deg);\n            transform: rotate(22deg);\n  }\n  32% {\n    -webkit-transform: rotate(-12deg);\n            transform: rotate(-12deg);\n  }\n  36% {\n    -webkit-transform: rotate(12deg);\n            transform: rotate(12deg);\n  }\n  40%, 100% {\n    -webkit-transform: rotate(0deg);\n            transform: rotate(0deg);\n  }\n}\n@keyframes fa-shake {\n  0% {\n    -webkit-transform: rotate(-15deg);\n            transform: rotate(-15deg);\n  }\n  4% {\n    -webkit-transform: rotate(15deg);\n            transform: rotate(15deg);\n  }\n  8%, 24% {\n    -webkit-transform: rotate(-18deg);\n            transform: rotate(-18deg);\n  }\n  12%, 28% {\n    -webkit-transform: rotate(18deg);\n            transform: rotate(18deg);\n  }\n  16% {\n    -webkit-transform: rotate(-22deg);\n            transform: rotate(-22deg);\n  }\n  20% {\n    -webkit-transform: rotate(22deg);\n            transform: rotate(22deg);\n  }\n  32% {\n    -webkit-transform: rotate(-12deg);\n            transform: rotate(-12deg);\n  }\n  36% {\n    -webkit-transform: rotate(12deg);\n            transform: rotate(12deg);\n  }\n  40%, 100% {\n    -webkit-transform: rotate(0deg);\n            transform: rotate(0deg);\n  }\n}\n@-webkit-keyframes fa-spin {\n  0% {\n    -webkit-transform: rotate(0deg);\n            transform: rotate(0deg);\n  }\n  100% {\n    -webkit-transform: rotate(360deg);\n            transform: rotate(360deg);\n  }\n}\n@keyframes fa-spin {\n  0% {\n    -webkit-transform: rotate(0deg);\n            transform: rotate(0deg);\n  }\n  100% {\n    -webkit-transform: rotate(360deg);\n            transform: rotate(360deg);\n  }\n}\n.fa-rotate-90 {\n  -webkit-transform: rotate(90deg);\n          transform: rotate(90deg);\n}\n\n.fa-rotate-180 {\n  -webkit-transform: rotate(180deg);\n          transform: rotate(180deg);\n}\n\n.fa-rotate-270 {\n  -webkit-transform: rotate(270deg);\n          transform: rotate(270deg);\n}\n\n.fa-flip-horizontal {\n  -webkit-transform: scale(-1, 1);\n          transform: scale(-1, 1);\n}\n\n.fa-flip-vertical {\n  -webkit-transform: scale(1, -1);\n          transform: scale(1, -1);\n}\n\n.fa-flip-both,\n.fa-flip-horizontal.fa-flip-vertical {\n  -webkit-transform: scale(-1, -1);\n          transform: scale(-1, -1);\n}\n\n.fa-rotate-by {\n  -webkit-transform: rotate(var(--fa-rotate-angle, 0));\n          transform: rotate(var(--fa-rotate-angle, 0));\n}\n\n.fa-stack {\n  display: inline-block;\n  vertical-align: middle;\n  height: 2em;\n  position: relative;\n  width: 2.5em;\n}\n\n.fa-stack-1x,\n.fa-stack-2x {\n  bottom: 0;\n  left: 0;\n  margin: auto;\n  position: absolute;\n  right: 0;\n  top: 0;\n  z-index: var(--fa-stack-z-index, auto);\n}\n\n.svg-inline--fa.fa-stack-1x {\n  height: 1em;\n  width: 1.25em;\n}\n.svg-inline--fa.fa-stack-2x {\n  height: 2em;\n  width: 2.5em;\n}\n\n.fa-inverse {\n  color: var(--fa-inverse, #fff);\n}\n\n.sr-only,\n.fa-sr-only {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border-width: 0;\n}\n\n.sr-only-focusable:not(:focus),\n.fa-sr-only-focusable:not(:focus) {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border-width: 0;\n}\n\n.svg-inline--fa .fa-primary {\n  fill: var(--fa-primary-color, currentColor);\n  opacity: var(--fa-primary-opacity, 1);\n}\n\n.svg-inline--fa .fa-secondary {\n  fill: var(--fa-secondary-color, currentColor);\n  opacity: var(--fa-secondary-opacity, 0.4);\n}\n\n.svg-inline--fa.fa-swap-opacity .fa-primary {\n  opacity: var(--fa-secondary-opacity, 0.4);\n}\n\n.svg-inline--fa.fa-swap-opacity .fa-secondary {\n  opacity: var(--fa-primary-opacity, 1);\n}\n\n.svg-inline--fa mask .fa-primary,\n.svg-inline--fa mask .fa-secondary {\n  fill: black;\n}\n\n.fad.fa-inverse,\n.fa-duotone.fa-inverse {\n  color: var(--fa-inverse, #fff);\n}";

	function css() {
	  var dcp = DEFAULT_CSS_PREFIX;
	  var drc = DEFAULT_REPLACEMENT_CLASS;
	  var fp = config.cssPrefix;
	  var rc = config.replacementClass;
	  var s = baseStyles;

	  if (fp !== dcp || rc !== drc) {
	    var dPatt = new RegExp("\\.".concat(dcp, "\\-"), 'g');
	    var customPropPatt = new RegExp("\\--".concat(dcp, "\\-"), 'g');
	    var rPatt = new RegExp("\\.".concat(drc), 'g');
	    s = s.replace(dPatt, ".".concat(fp, "-")).replace(customPropPatt, "--".concat(fp, "-")).replace(rPatt, ".".concat(rc));
	  }

	  return s;
	}

	var _cssInserted = false;

	function ensureCss() {
	  if (config.autoAddCss && !_cssInserted) {
	    insertCss(css());
	    _cssInserted = true;
	  }
	}

	var InjectCSS = {
	  mixout: function mixout() {
	    return {
	      dom: {
	        css: css,
	        insertCss: ensureCss
	      }
	    };
	  },
	  hooks: function hooks() {
	    return {
	      beforeDOMElementCreation: function beforeDOMElementCreation() {
	        ensureCss();
	      },
	      beforeI2svg: function beforeI2svg() {
	        ensureCss();
	      }
	    };
	  }
	};

	var w = WINDOW || {};
	if (!w[NAMESPACE_IDENTIFIER]) w[NAMESPACE_IDENTIFIER] = {};
	if (!w[NAMESPACE_IDENTIFIER].styles) w[NAMESPACE_IDENTIFIER].styles = {};
	if (!w[NAMESPACE_IDENTIFIER].hooks) w[NAMESPACE_IDENTIFIER].hooks = {};
	if (!w[NAMESPACE_IDENTIFIER].shims) w[NAMESPACE_IDENTIFIER].shims = [];
	var namespace = w[NAMESPACE_IDENTIFIER];

	var functions = [];

	var listener = function listener() {
	  DOCUMENT.removeEventListener('DOMContentLoaded', listener);
	  loaded = 1;
	  functions.map(function (fn) {
	    return fn();
	  });
	};

	var loaded = false;

	if (IS_DOM) {
	  loaded = (DOCUMENT.documentElement.doScroll ? /^loaded|^c/ : /^loaded|^i|^c/).test(DOCUMENT.readyState);
	  if (!loaded) DOCUMENT.addEventListener('DOMContentLoaded', listener);
	}

	function domready (fn) {
	  if (!IS_DOM) return;
	  loaded ? setTimeout(fn, 0) : functions.push(fn);
	}

	function toHtml(abstractNodes) {
	  var tag = abstractNodes.tag,
	      _abstractNodes$attrib = abstractNodes.attributes,
	      attributes = _abstractNodes$attrib === void 0 ? {} : _abstractNodes$attrib,
	      _abstractNodes$childr = abstractNodes.children,
	      children = _abstractNodes$childr === void 0 ? [] : _abstractNodes$childr;

	  if (typeof abstractNodes === 'string') {
	    return htmlEscape(abstractNodes);
	  } else {
	    return "<".concat(tag, " ").concat(joinAttributes(attributes), ">").concat(children.map(toHtml).join(''), "</").concat(tag, ">");
	  }
	}

	function iconFromMapping(mapping, prefix, iconName) {
	  if (mapping && mapping[prefix] && mapping[prefix][iconName]) {
	    return {
	      prefix: prefix,
	      iconName: iconName,
	      icon: mapping[prefix][iconName]
	    };
	  }
	}

	/**
	 * Internal helper to bind a function known to have 4 arguments
	 * to a given context.
	 */

	var bindInternal4 = function bindInternal4(func, thisContext) {
	  return function (a, b, c, d) {
	    return func.call(thisContext, a, b, c, d);
	  };
	};

	/**
	 * # Reduce
	 *
	 * A fast object `.reduce()` implementation.
	 *
	 * @param  {Object}   subject      The object to reduce over.
	 * @param  {Function} fn           The reducer function.
	 * @param  {mixed}    initialValue The initial value for the reducer, defaults to subject[0].
	 * @param  {Object}   thisContext  The context for the reducer.
	 * @return {mixed}                 The final result.
	 */


	var reduce = function fastReduceObject(subject, fn, initialValue, thisContext) {
	  var keys = Object.keys(subject),
	      length = keys.length,
	      iterator = thisContext !== undefined ? bindInternal4(fn, thisContext) : fn,
	      i,
	      key,
	      result;

	  if (initialValue === undefined) {
	    i = 1;
	    result = subject[keys[0]];
	  } else {
	    i = 0;
	    result = initialValue;
	  }

	  for (; i < length; i++) {
	    key = keys[i];
	    result = iterator(result, subject[key], key, subject);
	  }

	  return result;
	};

	/**
	 * ucs2decode() and codePointAt() are both works of Mathias Bynens and licensed under MIT
	 *
	 * Copyright Mathias Bynens <https://mathiasbynens.be/>

	 * Permission is hereby granted, free of charge, to any person obtaining
	 * a copy of this software and associated documentation files (the
	 * "Software"), to deal in the Software without restriction, including
	 * without limitation the rights to use, copy, modify, merge, publish,
	 * distribute, sublicense, and/or sell copies of the Software, and to
	 * permit persons to whom the Software is furnished to do so, subject to
	 * the following conditions:

	 * The above copyright notice and this permission notice shall be
	 * included in all copies or substantial portions of the Software.

	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
	 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
	 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
	 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
	 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
	 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
	 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
	 */
	function ucs2decode(string) {
	  var output = [];
	  var counter = 0;
	  var length = string.length;

	  while (counter < length) {
	    var value = string.charCodeAt(counter++);

	    if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
	      var extra = string.charCodeAt(counter++);

	      if ((extra & 0xFC00) == 0xDC00) {
	        // eslint-disable-line eqeqeq
	        output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
	      } else {
	        output.push(value);
	        counter--;
	      }
	    } else {
	      output.push(value);
	    }
	  }

	  return output;
	}

	function toHex(unicode) {
	  var decoded = ucs2decode(unicode);
	  return decoded.length === 1 ? decoded[0].toString(16) : null;
	}
	function codePointAt(string, index) {
	  var size = string.length;
	  var first = string.charCodeAt(index);
	  var second;

	  if (first >= 0xD800 && first <= 0xDBFF && size > index + 1) {
	    second = string.charCodeAt(index + 1);

	    if (second >= 0xDC00 && second <= 0xDFFF) {
	      return (first - 0xD800) * 0x400 + second - 0xDC00 + 0x10000;
	    }
	  }

	  return first;
	}

	function normalizeIcons(icons) {
	  return Object.keys(icons).reduce(function (acc, iconName) {
	    var icon = icons[iconName];
	    var expanded = !!icon.icon;

	    if (expanded) {
	      acc[icon.iconName] = icon.icon;
	    } else {
	      acc[iconName] = icon;
	    }

	    return acc;
	  }, {});
	}

	function defineIcons(prefix, icons) {
	  var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
	  var _params$skipHooks = params.skipHooks,
	      skipHooks = _params$skipHooks === void 0 ? false : _params$skipHooks;
	  var normalized = normalizeIcons(icons);

	  if (typeof namespace.hooks.addPack === 'function' && !skipHooks) {
	    namespace.hooks.addPack(prefix, normalizeIcons(icons));
	  } else {
	    namespace.styles[prefix] = _objectSpread2(_objectSpread2({}, namespace.styles[prefix] || {}), normalized);
	  }
	  /**
	   * Font Awesome 4 used the prefix of `fa` for all icons. With the introduction
	   * of new styles we needed to differentiate between them. Prefix `fa` is now an alias
	   * for `fas` so we'll ease the upgrade process for our users by automatically defining
	   * this as well.
	   */


	  if (prefix === 'fas') {
	    defineIcons('fa', icons);
	  }
	}

	var _LONG_STYLE, _PREFIXES, _PREFIXES_FOR_FAMILY;
	var styles = namespace.styles,
	    shims = namespace.shims;
	var LONG_STYLE = (_LONG_STYLE = {}, _defineProperty(_LONG_STYLE, FAMILY_CLASSIC, Object.values(PREFIX_TO_LONG_STYLE[FAMILY_CLASSIC])), _defineProperty(_LONG_STYLE, FAMILY_SHARP, Object.values(PREFIX_TO_LONG_STYLE[FAMILY_SHARP])), _LONG_STYLE);
	var _defaultUsablePrefix = null;
	var _byUnicode = {};
	var _byLigature = {};
	var _byOldName = {};
	var _byOldUnicode = {};
	var _byAlias = {};
	var PREFIXES = (_PREFIXES = {}, _defineProperty(_PREFIXES, FAMILY_CLASSIC, Object.keys(PREFIX_TO_STYLE[FAMILY_CLASSIC])), _defineProperty(_PREFIXES, FAMILY_SHARP, Object.keys(PREFIX_TO_STYLE[FAMILY_SHARP])), _PREFIXES);

	function isReserved(name) {
	  return ~RESERVED_CLASSES.indexOf(name);
	}

	function getIconName(cssPrefix, cls) {
	  var parts = cls.split('-');
	  var prefix = parts[0];
	  var iconName = parts.slice(1).join('-');

	  if (prefix === cssPrefix && iconName !== '' && !isReserved(iconName)) {
	    return iconName;
	  } else {
	    return null;
	  }
	}
	var build = function build() {
	  var lookup = function lookup(reducer) {
	    return reduce(styles, function (o, style, prefix) {
	      o[prefix] = reduce(style, reducer, {});
	      return o;
	    }, {});
	  };

	  _byUnicode = lookup(function (acc, icon, iconName) {
	    if (icon[3]) {
	      acc[icon[3]] = iconName;
	    }

	    if (icon[2]) {
	      var aliases = icon[2].filter(function (a) {
	        return typeof a === 'number';
	      });
	      aliases.forEach(function (alias) {
	        acc[alias.toString(16)] = iconName;
	      });
	    }

	    return acc;
	  });
	  _byLigature = lookup(function (acc, icon, iconName) {
	    acc[iconName] = iconName;

	    if (icon[2]) {
	      var aliases = icon[2].filter(function (a) {
	        return typeof a === 'string';
	      });
	      aliases.forEach(function (alias) {
	        acc[alias] = iconName;
	      });
	    }

	    return acc;
	  });
	  _byAlias = lookup(function (acc, icon, iconName) {
	    var aliases = icon[2];
	    acc[iconName] = iconName;
	    aliases.forEach(function (alias) {
	      acc[alias] = iconName;
	    });
	    return acc;
	  }); // If we have a Kit, we can't determine if regular is available since we
	  // could be auto-fetching it. We'll have to assume that it is available.

	  var hasRegular = 'far' in styles || config.autoFetchSvg;
	  var shimLookups = reduce(shims, function (acc, shim) {
	    var maybeNameMaybeUnicode = shim[0];
	    var prefix = shim[1];
	    var iconName = shim[2];

	    if (prefix === 'far' && !hasRegular) {
	      prefix = 'fas';
	    }

	    if (typeof maybeNameMaybeUnicode === 'string') {
	      acc.names[maybeNameMaybeUnicode] = {
	        prefix: prefix,
	        iconName: iconName
	      };
	    }

	    if (typeof maybeNameMaybeUnicode === 'number') {
	      acc.unicodes[maybeNameMaybeUnicode.toString(16)] = {
	        prefix: prefix,
	        iconName: iconName
	      };
	    }

	    return acc;
	  }, {
	    names: {},
	    unicodes: {}
	  });
	  _byOldName = shimLookups.names;
	  _byOldUnicode = shimLookups.unicodes;
	  _defaultUsablePrefix = getCanonicalPrefix(config.styleDefault, {
	    family: config.familyDefault
	  });
	};
	onChange(function (c) {
	  _defaultUsablePrefix = getCanonicalPrefix(c.styleDefault, {
	    family: config.familyDefault
	  });
	});
	build();
	function byUnicode(prefix, unicode) {
	  return (_byUnicode[prefix] || {})[unicode];
	}
	function byLigature(prefix, ligature) {
	  return (_byLigature[prefix] || {})[ligature];
	}
	function byAlias(prefix, alias) {
	  return (_byAlias[prefix] || {})[alias];
	}
	function byOldName(name) {
	  return _byOldName[name] || {
	    prefix: null,
	    iconName: null
	  };
	}
	function byOldUnicode(unicode) {
	  var oldUnicode = _byOldUnicode[unicode];
	  var newUnicode = byUnicode('fas', unicode);
	  return oldUnicode || (newUnicode ? {
	    prefix: 'fas',
	    iconName: newUnicode
	  } : null) || {
	    prefix: null,
	    iconName: null
	  };
	}
	function getDefaultUsablePrefix() {
	  return _defaultUsablePrefix;
	}
	var emptyCanonicalIcon = function emptyCanonicalIcon() {
	  return {
	    prefix: null,
	    iconName: null,
	    rest: []
	  };
	};
	function getCanonicalPrefix(styleOrPrefix) {
	  var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	  var _params$family = params.family,
	      family = _params$family === void 0 ? FAMILY_CLASSIC : _params$family;
	  var style = PREFIX_TO_STYLE[family][styleOrPrefix];
	  var prefix = STYLE_TO_PREFIX[family][styleOrPrefix] || STYLE_TO_PREFIX[family][style];
	  var defined = styleOrPrefix in namespace.styles ? styleOrPrefix : null;
	  return prefix || defined || null;
	}
	var PREFIXES_FOR_FAMILY = (_PREFIXES_FOR_FAMILY = {}, _defineProperty(_PREFIXES_FOR_FAMILY, FAMILY_CLASSIC, Object.keys(PREFIX_TO_LONG_STYLE[FAMILY_CLASSIC])), _defineProperty(_PREFIXES_FOR_FAMILY, FAMILY_SHARP, Object.keys(PREFIX_TO_LONG_STYLE[FAMILY_SHARP])), _PREFIXES_FOR_FAMILY);
	function getCanonicalIcon(values) {
	  var _famProps;

	  var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	  var _params$skipLookups = params.skipLookups,
	      skipLookups = _params$skipLookups === void 0 ? false : _params$skipLookups;
	  var famProps = (_famProps = {}, _defineProperty(_famProps, FAMILY_CLASSIC, "".concat(config.cssPrefix, "-").concat(FAMILY_CLASSIC)), _defineProperty(_famProps, FAMILY_SHARP, "".concat(config.cssPrefix, "-").concat(FAMILY_SHARP)), _famProps);
	  var givenPrefix = null;
	  var family = FAMILY_CLASSIC;

	  if (values.includes(famProps[FAMILY_CLASSIC]) || values.some(function (v) {
	    return PREFIXES_FOR_FAMILY[FAMILY_CLASSIC].includes(v);
	  })) {
	    family = FAMILY_CLASSIC;
	  }

	  if (values.includes(famProps[FAMILY_SHARP]) || values.some(function (v) {
	    return PREFIXES_FOR_FAMILY[FAMILY_SHARP].includes(v);
	  })) {
	    family = FAMILY_SHARP;
	  }

	  var canonical = values.reduce(function (acc, cls) {
	    var iconName = getIconName(config.cssPrefix, cls);

	    if (styles[cls]) {
	      cls = LONG_STYLE[family].includes(cls) ? LONG_STYLE_TO_PREFIX[family][cls] : cls;
	      givenPrefix = cls;
	      acc.prefix = cls;
	    } else if (PREFIXES[family].indexOf(cls) > -1) {
	      givenPrefix = cls;
	      acc.prefix = getCanonicalPrefix(cls, {
	        family: family
	      });
	    } else if (iconName) {
	      acc.iconName = iconName;
	    } else if (cls !== config.replacementClass && cls !== famProps[FAMILY_CLASSIC] && cls !== famProps[FAMILY_SHARP]) {
	      acc.rest.push(cls);
	    }

	    if (!skipLookups && acc.prefix && acc.iconName) {
	      var shim = givenPrefix === 'fa' ? byOldName(acc.iconName) : {};
	      var aliasIconName = byAlias(acc.prefix, acc.iconName);

	      if (shim.prefix) {
	        givenPrefix = null;
	      }

	      acc.iconName = shim.iconName || aliasIconName || acc.iconName;
	      acc.prefix = shim.prefix || acc.prefix;

	      if (acc.prefix === 'far' && !styles['far'] && styles['fas'] && !config.autoFetchSvg) {
	        // Allow a fallback from the regular style to solid if regular is not available
	        // but only if we aren't auto-fetching SVGs
	        acc.prefix = 'fas';
	      }
	    }

	    return acc;
	  }, emptyCanonicalIcon());

	  if (values.includes('fa-brands') || values.includes('fab')) {
	    canonical.prefix = 'fab';
	  }

	  if (values.includes('fa-duotone') || values.includes('fad')) {
	    canonical.prefix = 'fad';
	  }

	  if (!canonical.prefix && family === FAMILY_SHARP && (styles['fass'] || config.autoFetchSvg)) {
	    canonical.prefix = 'fass';
	    canonical.iconName = byAlias(canonical.prefix, canonical.iconName) || canonical.iconName;
	  }

	  if (canonical.prefix === 'fa' || givenPrefix === 'fa') {
	    // The fa prefix is not canonical. So if it has made it through until this point
	    // we will shift it to the correct prefix.
	    canonical.prefix = getDefaultUsablePrefix() || 'fas';
	  }

	  return canonical;
	}

	var Library = /*#__PURE__*/function () {
	  function Library() {
	    _classCallCheck(this, Library);

	    this.definitions = {};
	  }

	  _createClass(Library, [{
	    key: "add",
	    value: function add() {
	      var _this = this;

	      for (var _len = arguments.length, definitions = new Array(_len), _key = 0; _key < _len; _key++) {
	        definitions[_key] = arguments[_key];
	      }

	      var additions = definitions.reduce(this._pullDefinitions, {});
	      Object.keys(additions).forEach(function (key) {
	        _this.definitions[key] = _objectSpread2(_objectSpread2({}, _this.definitions[key] || {}), additions[key]);
	        defineIcons(key, additions[key]); // TODO can we stop doing this? We can't get the icons by 'fa-solid' any longer so this probably needs to change

	        var longPrefix = PREFIX_TO_LONG_STYLE[FAMILY_CLASSIC][key];
	        if (longPrefix) defineIcons(longPrefix, additions[key]);
	        build();
	      });
	    }
	  }, {
	    key: "reset",
	    value: function reset() {
	      this.definitions = {};
	    }
	  }, {
	    key: "_pullDefinitions",
	    value: function _pullDefinitions(additions, definition) {
	      var normalized = definition.prefix && definition.iconName && definition.icon ? {
	        0: definition
	      } : definition;
	      Object.keys(normalized).map(function (key) {
	        var _normalized$key = normalized[key],
	            prefix = _normalized$key.prefix,
	            iconName = _normalized$key.iconName,
	            icon = _normalized$key.icon;
	        var aliases = icon[2];
	        if (!additions[prefix]) additions[prefix] = {};

	        if (aliases.length > 0) {
	          aliases.forEach(function (alias) {
	            if (typeof alias === 'string') {
	              additions[prefix][alias] = icon;
	            }
	          });
	        }

	        additions[prefix][iconName] = icon;
	      });
	      return additions;
	    }
	  }]);

	  return Library;
	}();

	var _plugins = [];
	var _hooks = {};
	var providers = {};
	var defaultProviderKeys = Object.keys(providers);
	function registerPlugins(nextPlugins, _ref) {
	  var obj = _ref.mixoutsTo;
	  _plugins = nextPlugins;
	  _hooks = {};
	  Object.keys(providers).forEach(function (k) {
	    if (defaultProviderKeys.indexOf(k) === -1) {
	      delete providers[k];
	    }
	  });

	  _plugins.forEach(function (plugin) {
	    var mixout = plugin.mixout ? plugin.mixout() : {};
	    Object.keys(mixout).forEach(function (tk) {
	      if (typeof mixout[tk] === 'function') {
	        obj[tk] = mixout[tk];
	      }

	      if (_typeof(mixout[tk]) === 'object') {
	        Object.keys(mixout[tk]).forEach(function (sk) {
	          if (!obj[tk]) {
	            obj[tk] = {};
	          }

	          obj[tk][sk] = mixout[tk][sk];
	        });
	      }
	    });

	    if (plugin.hooks) {
	      var hooks = plugin.hooks();
	      Object.keys(hooks).forEach(function (hook) {
	        if (!_hooks[hook]) {
	          _hooks[hook] = [];
	        }

	        _hooks[hook].push(hooks[hook]);
	      });
	    }

	    if (plugin.provides) {
	      plugin.provides(providers);
	    }
	  });

	  return obj;
	}
	function chainHooks(hook, accumulator) {
	  for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
	    args[_key - 2] = arguments[_key];
	  }

	  var hookFns = _hooks[hook] || [];
	  hookFns.forEach(function (hookFn) {
	    accumulator = hookFn.apply(null, [accumulator].concat(args)); // eslint-disable-line no-useless-call
	  });
	  return accumulator;
	}
	function callHooks(hook) {
	  for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
	    args[_key2 - 1] = arguments[_key2];
	  }

	  var hookFns = _hooks[hook] || [];
	  hookFns.forEach(function (hookFn) {
	    hookFn.apply(null, args);
	  });
	  return undefined;
	}
	function callProvided() {
	  var hook = arguments[0];
	  var args = Array.prototype.slice.call(arguments, 1);
	  return providers[hook] ? providers[hook].apply(null, args) : undefined;
	}

	function findIconDefinition(iconLookup) {
	  if (iconLookup.prefix === 'fa') {
	    iconLookup.prefix = 'fas';
	  }

	  var iconName = iconLookup.iconName;
	  var prefix = iconLookup.prefix || getDefaultUsablePrefix();
	  if (!iconName) return;
	  iconName = byAlias(prefix, iconName) || iconName;
	  return iconFromMapping(library.definitions, prefix, iconName) || iconFromMapping(namespace.styles, prefix, iconName);
	}
	var library = new Library();
	var noAuto = function noAuto() {
	  config.autoReplaceSvg = false;
	  config.observeMutations = false;
	  callHooks('noAuto');
	};
	var dom = {
	  i2svg: function i2svg() {
	    var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

	    if (IS_DOM) {
	      callHooks('beforeI2svg', params);
	      callProvided('pseudoElements2svg', params);
	      return callProvided('i2svg', params);
	    } else {
	      return Promise.reject('Operation requires a DOM of some kind.');
	    }
	  },
	  watch: function watch() {
	    var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
	    var autoReplaceSvgRoot = params.autoReplaceSvgRoot;

	    if (config.autoReplaceSvg === false) {
	      config.autoReplaceSvg = true;
	    }

	    config.observeMutations = true;
	    domready(function () {
	      autoReplace({
	        autoReplaceSvgRoot: autoReplaceSvgRoot
	      });
	      callHooks('watch', params);
	    });
	  }
	};
	var parse = {
	  icon: function icon(_icon) {
	    if (_icon === null) {
	      return null;
	    }

	    if (_typeof(_icon) === 'object' && _icon.prefix && _icon.iconName) {
	      return {
	        prefix: _icon.prefix,
	        iconName: byAlias(_icon.prefix, _icon.iconName) || _icon.iconName
	      };
	    }

	    if (Array.isArray(_icon) && _icon.length === 2) {
	      var iconName = _icon[1].indexOf('fa-') === 0 ? _icon[1].slice(3) : _icon[1];
	      var prefix = getCanonicalPrefix(_icon[0]);
	      return {
	        prefix: prefix,
	        iconName: byAlias(prefix, iconName) || iconName
	      };
	    }

	    if (typeof _icon === 'string' && (_icon.indexOf("".concat(config.cssPrefix, "-")) > -1 || _icon.match(ICON_SELECTION_SYNTAX_PATTERN))) {
	      var canonicalIcon = getCanonicalIcon(_icon.split(' '), {
	        skipLookups: true
	      });
	      return {
	        prefix: canonicalIcon.prefix || getDefaultUsablePrefix(),
	        iconName: byAlias(canonicalIcon.prefix, canonicalIcon.iconName) || canonicalIcon.iconName
	      };
	    }

	    if (typeof _icon === 'string') {
	      var _prefix = getDefaultUsablePrefix();

	      return {
	        prefix: _prefix,
	        iconName: byAlias(_prefix, _icon) || _icon
	      };
	    }
	  }
	};
	var api = {
	  noAuto: noAuto,
	  config: config,
	  dom: dom,
	  parse: parse,
	  library: library,
	  findIconDefinition: findIconDefinition,
	  toHtml: toHtml
	};

	var autoReplace = function autoReplace() {
	  var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
	  var _params$autoReplaceSv = params.autoReplaceSvgRoot,
	      autoReplaceSvgRoot = _params$autoReplaceSv === void 0 ? DOCUMENT : _params$autoReplaceSv;
	  if ((Object.keys(namespace.styles).length > 0 || config.autoFetchSvg) && IS_DOM && config.autoReplaceSvg) api.dom.i2svg({
	    node: autoReplaceSvgRoot
	  });
	};

	function domVariants(val, abstractCreator) {
	  Object.defineProperty(val, 'abstract', {
	    get: abstractCreator
	  });
	  Object.defineProperty(val, 'html', {
	    get: function get() {
	      return val.abstract.map(function (a) {
	        return toHtml(a);
	      });
	    }
	  });
	  Object.defineProperty(val, 'node', {
	    get: function get() {
	      if (!IS_DOM) return;
	      var container = DOCUMENT.createElement('div');
	      container.innerHTML = val.html;
	      return container.children;
	    }
	  });
	  return val;
	}

	function asIcon (_ref) {
	  var children = _ref.children,
	      main = _ref.main,
	      mask = _ref.mask,
	      attributes = _ref.attributes,
	      styles = _ref.styles,
	      transform = _ref.transform;

	  if (transformIsMeaningful(transform) && main.found && !mask.found) {
	    var width = main.width,
	        height = main.height;
	    var offset = {
	      x: width / height / 2,
	      y: 0.5
	    };
	    attributes['style'] = joinStyles(_objectSpread2(_objectSpread2({}, styles), {}, {
	      'transform-origin': "".concat(offset.x + transform.x / 16, "em ").concat(offset.y + transform.y / 16, "em")
	    }));
	  }

	  return [{
	    tag: 'svg',
	    attributes: attributes,
	    children: children
	  }];
	}

	function asSymbol (_ref) {
	  var prefix = _ref.prefix,
	      iconName = _ref.iconName,
	      children = _ref.children,
	      attributes = _ref.attributes,
	      symbol = _ref.symbol;
	  var id = symbol === true ? "".concat(prefix, "-").concat(config.cssPrefix, "-").concat(iconName) : symbol;
	  return [{
	    tag: 'svg',
	    attributes: {
	      style: 'display: none;'
	    },
	    children: [{
	      tag: 'symbol',
	      attributes: _objectSpread2(_objectSpread2({}, attributes), {}, {
	        id: id
	      }),
	      children: children
	    }]
	  }];
	}

	function makeInlineSvgAbstract(params) {
	  var _params$icons = params.icons,
	      main = _params$icons.main,
	      mask = _params$icons.mask,
	      prefix = params.prefix,
	      iconName = params.iconName,
	      transform = params.transform,
	      symbol = params.symbol,
	      title = params.title,
	      maskId = params.maskId,
	      titleId = params.titleId,
	      extra = params.extra,
	      _params$watchable = params.watchable,
	      watchable = _params$watchable === void 0 ? false : _params$watchable;

	  var _ref = mask.found ? mask : main,
	      width = _ref.width,
	      height = _ref.height;

	  var isUploadedIcon = prefix === 'fak';
	  var attrClass = [config.replacementClass, iconName ? "".concat(config.cssPrefix, "-").concat(iconName) : ''].filter(function (c) {
	    return extra.classes.indexOf(c) === -1;
	  }).filter(function (c) {
	    return c !== '' || !!c;
	  }).concat(extra.classes).join(' ');
	  var content = {
	    children: [],
	    attributes: _objectSpread2(_objectSpread2({}, extra.attributes), {}, {
	      'data-prefix': prefix,
	      'data-icon': iconName,
	      'class': attrClass,
	      'role': extra.attributes.role || 'img',
	      'xmlns': 'http://www.w3.org/2000/svg',
	      'viewBox': "0 0 ".concat(width, " ").concat(height)
	    })
	  };
	  var uploadedIconWidthStyle = isUploadedIcon && !~extra.classes.indexOf('fa-fw') ? {
	    width: "".concat(width / height * 16 * 0.0625, "em")
	  } : {};

	  if (watchable) {
	    content.attributes[DATA_FA_I2SVG] = '';
	  }

	  if (title) {
	    content.children.push({
	      tag: 'title',
	      attributes: {
	        id: content.attributes['aria-labelledby'] || "title-".concat(titleId || nextUniqueId())
	      },
	      children: [title]
	    });
	    delete content.attributes.title;
	  }

	  var args = _objectSpread2(_objectSpread2({}, content), {}, {
	    prefix: prefix,
	    iconName: iconName,
	    main: main,
	    mask: mask,
	    maskId: maskId,
	    transform: transform,
	    symbol: symbol,
	    styles: _objectSpread2(_objectSpread2({}, uploadedIconWidthStyle), extra.styles)
	  });

	  var _ref2 = mask.found && main.found ? callProvided('generateAbstractMask', args) || {
	    children: [],
	    attributes: {}
	  } : callProvided('generateAbstractIcon', args) || {
	    children: [],
	    attributes: {}
	  },
	      children = _ref2.children,
	      attributes = _ref2.attributes;

	  args.children = children;
	  args.attributes = attributes;

	  if (symbol) {
	    return asSymbol(args);
	  } else {
	    return asIcon(args);
	  }
	}
	function makeLayersTextAbstract(params) {
	  var content = params.content,
	      width = params.width,
	      height = params.height,
	      transform = params.transform,
	      title = params.title,
	      extra = params.extra,
	      _params$watchable2 = params.watchable,
	      watchable = _params$watchable2 === void 0 ? false : _params$watchable2;

	  var attributes = _objectSpread2(_objectSpread2(_objectSpread2({}, extra.attributes), title ? {
	    'title': title
	  } : {}), {}, {
	    'class': extra.classes.join(' ')
	  });

	  if (watchable) {
	    attributes[DATA_FA_I2SVG] = '';
	  }

	  var styles = _objectSpread2({}, extra.styles);

	  if (transformIsMeaningful(transform)) {
	    styles['transform'] = transformForCss({
	      transform: transform,
	      startCentered: true,
	      width: width,
	      height: height
	    });
	    styles['-webkit-transform'] = styles['transform'];
	  }

	  var styleString = joinStyles(styles);

	  if (styleString.length > 0) {
	    attributes['style'] = styleString;
	  }

	  var val = [];
	  val.push({
	    tag: 'span',
	    attributes: attributes,
	    children: [content]
	  });

	  if (title) {
	    val.push({
	      tag: 'span',
	      attributes: {
	        class: 'sr-only'
	      },
	      children: [title]
	    });
	  }

	  return val;
	}
	function makeLayersCounterAbstract(params) {
	  var content = params.content,
	      title = params.title,
	      extra = params.extra;

	  var attributes = _objectSpread2(_objectSpread2(_objectSpread2({}, extra.attributes), title ? {
	    'title': title
	  } : {}), {}, {
	    'class': extra.classes.join(' ')
	  });

	  var styleString = joinStyles(extra.styles);

	  if (styleString.length > 0) {
	    attributes['style'] = styleString;
	  }

	  var val = [];
	  val.push({
	    tag: 'span',
	    attributes: attributes,
	    children: [content]
	  });

	  if (title) {
	    val.push({
	      tag: 'span',
	      attributes: {
	        class: 'sr-only'
	      },
	      children: [title]
	    });
	  }

	  return val;
	}

	var styles$1 = namespace.styles;
	function asFoundIcon(icon) {
	  var width = icon[0];
	  var height = icon[1];

	  var _icon$slice = icon.slice(4),
	      _icon$slice2 = _slicedToArray(_icon$slice, 1),
	      vectorData = _icon$slice2[0];

	  var element = null;

	  if (Array.isArray(vectorData)) {
	    element = {
	      tag: 'g',
	      attributes: {
	        class: "".concat(config.cssPrefix, "-").concat(DUOTONE_CLASSES.GROUP)
	      },
	      children: [{
	        tag: 'path',
	        attributes: {
	          class: "".concat(config.cssPrefix, "-").concat(DUOTONE_CLASSES.SECONDARY),
	          fill: 'currentColor',
	          d: vectorData[0]
	        }
	      }, {
	        tag: 'path',
	        attributes: {
	          class: "".concat(config.cssPrefix, "-").concat(DUOTONE_CLASSES.PRIMARY),
	          fill: 'currentColor',
	          d: vectorData[1]
	        }
	      }]
	    };
	  } else {
	    element = {
	      tag: 'path',
	      attributes: {
	        fill: 'currentColor',
	        d: vectorData
	      }
	    };
	  }

	  return {
	    found: true,
	    width: width,
	    height: height,
	    icon: element
	  };
	}
	var missingIconResolutionMixin = {
	  found: false,
	  width: 512,
	  height: 512
	};

	function maybeNotifyMissing(iconName, prefix) {
	  if (!PRODUCTION$1 && !config.showMissingIcons && iconName) {
	    console.error("Icon with name \"".concat(iconName, "\" and prefix \"").concat(prefix, "\" is missing."));
	  }
	}

	function findIcon(iconName, prefix) {
	  var givenPrefix = prefix;

	  if (prefix === 'fa' && config.styleDefault !== null) {
	    prefix = getDefaultUsablePrefix();
	  }

	  return new Promise(function (resolve, reject) {
	    ({
	      found: false,
	      width: 512,
	      height: 512,
	      icon: callProvided('missingIconAbstract') || {}
	    });

	    if (givenPrefix === 'fa') {
	      var shim = byOldName(iconName) || {};
	      iconName = shim.iconName || iconName;
	      prefix = shim.prefix || prefix;
	    }

	    if (iconName && prefix && styles$1[prefix] && styles$1[prefix][iconName]) {
	      var icon = styles$1[prefix][iconName];
	      return resolve(asFoundIcon(icon));
	    }

	    maybeNotifyMissing(iconName, prefix);
	    resolve(_objectSpread2(_objectSpread2({}, missingIconResolutionMixin), {}, {
	      icon: config.showMissingIcons && iconName ? callProvided('missingIconAbstract') || {} : {}
	    }));
	  });
	}

	var noop$1 = function noop() {};

	var p = config.measurePerformance && PERFORMANCE && PERFORMANCE.mark && PERFORMANCE.measure ? PERFORMANCE : {
	  mark: noop$1,
	  measure: noop$1
	};
	var preamble = "FA \"6.5.2\"";

	var begin = function begin(name) {
	  p.mark("".concat(preamble, " ").concat(name, " begins"));
	  return function () {
	    return end(name);
	  };
	};

	var end = function end(name) {
	  p.mark("".concat(preamble, " ").concat(name, " ends"));
	  p.measure("".concat(preamble, " ").concat(name), "".concat(preamble, " ").concat(name, " begins"), "".concat(preamble, " ").concat(name, " ends"));
	};

	var perf = {
	  begin: begin,
	  end: end
	};

	var noop$2 = function noop() {};

	function isWatched(node) {
	  var i2svg = node.getAttribute ? node.getAttribute(DATA_FA_I2SVG) : null;
	  return typeof i2svg === 'string';
	}

	function hasPrefixAndIcon(node) {
	  var prefix = node.getAttribute ? node.getAttribute(DATA_PREFIX) : null;
	  var icon = node.getAttribute ? node.getAttribute(DATA_ICON) : null;
	  return prefix && icon;
	}

	function hasBeenReplaced(node) {
	  return node && node.classList && node.classList.contains && node.classList.contains(config.replacementClass);
	}

	function getMutator() {
	  if (config.autoReplaceSvg === true) {
	    return mutators.replace;
	  }

	  var mutator = mutators[config.autoReplaceSvg];
	  return mutator || mutators.replace;
	}

	function createElementNS(tag) {
	  return DOCUMENT.createElementNS('http://www.w3.org/2000/svg', tag);
	}

	function createElement(tag) {
	  return DOCUMENT.createElement(tag);
	}

	function convertSVG(abstractObj) {
	  var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	  var _params$ceFn = params.ceFn,
	      ceFn = _params$ceFn === void 0 ? abstractObj.tag === 'svg' ? createElementNS : createElement : _params$ceFn;

	  if (typeof abstractObj === 'string') {
	    return DOCUMENT.createTextNode(abstractObj);
	  }

	  var tag = ceFn(abstractObj.tag);
	  Object.keys(abstractObj.attributes || []).forEach(function (key) {
	    tag.setAttribute(key, abstractObj.attributes[key]);
	  });
	  var children = abstractObj.children || [];
	  children.forEach(function (child) {
	    tag.appendChild(convertSVG(child, {
	      ceFn: ceFn
	    }));
	  });
	  return tag;
	}

	function nodeAsComment(node) {
	  var comment = " ".concat(node.outerHTML, " ");
	  /* BEGIN.ATTRIBUTION */

	  comment = "".concat(comment, "Font Awesome fontawesome.com ");
	  /* END.ATTRIBUTION */

	  return comment;
	}

	var mutators = {
	  replace: function replace(mutation) {
	    var node = mutation[0];

	    if (node.parentNode) {
	      mutation[1].forEach(function (_abstract) {
	        node.parentNode.insertBefore(convertSVG(_abstract), node);
	      });

	      if (node.getAttribute(DATA_FA_I2SVG) === null && config.keepOriginalSource) {
	        var comment = DOCUMENT.createComment(nodeAsComment(node));
	        node.parentNode.replaceChild(comment, node);
	      } else {
	        node.remove();
	      }
	    }
	  },
	  nest: function nest(mutation) {
	    var node = mutation[0];
	    var _abstract2 = mutation[1]; // If we already have a replaced node we do not want to continue nesting within it.
	    // Short-circuit to the standard replacement

	    if (~classArray(node).indexOf(config.replacementClass)) {
	      return mutators.replace(mutation);
	    }

	    var forSvg = new RegExp("".concat(config.cssPrefix, "-.*"));
	    delete _abstract2[0].attributes.id;

	    if (_abstract2[0].attributes.class) {
	      var splitClasses = _abstract2[0].attributes.class.split(' ').reduce(function (acc, cls) {
	        if (cls === config.replacementClass || cls.match(forSvg)) {
	          acc.toSvg.push(cls);
	        } else {
	          acc.toNode.push(cls);
	        }

	        return acc;
	      }, {
	        toNode: [],
	        toSvg: []
	      });

	      _abstract2[0].attributes.class = splitClasses.toSvg.join(' ');

	      if (splitClasses.toNode.length === 0) {
	        node.removeAttribute('class');
	      } else {
	        node.setAttribute('class', splitClasses.toNode.join(' '));
	      }
	    }

	    var newInnerHTML = _abstract2.map(function (a) {
	      return toHtml(a);
	    }).join('\n');

	    node.setAttribute(DATA_FA_I2SVG, '');
	    node.innerHTML = newInnerHTML;
	  }
	};

	function performOperationSync(op) {
	  op();
	}

	function perform(mutations, callback) {
	  var callbackFunction = typeof callback === 'function' ? callback : noop$2;

	  if (mutations.length === 0) {
	    callbackFunction();
	  } else {
	    var frame = performOperationSync;

	    if (config.mutateApproach === MUTATION_APPROACH_ASYNC) {
	      frame = WINDOW.requestAnimationFrame || performOperationSync;
	    }

	    frame(function () {
	      var mutator = getMutator();
	      var mark = perf.begin('mutate');
	      mutations.map(mutator);
	      mark();
	      callbackFunction();
	    });
	  }
	}
	var disabled = false;
	function disableObservation() {
	  disabled = true;
	}
	function enableObservation() {
	  disabled = false;
	}
	var mo = null;
	function observe(options) {
	  if (!MUTATION_OBSERVER) {
	    return;
	  }

	  if (!config.observeMutations) {
	    return;
	  }

	  var _options$treeCallback = options.treeCallback,
	      treeCallback = _options$treeCallback === void 0 ? noop$2 : _options$treeCallback,
	      _options$nodeCallback = options.nodeCallback,
	      nodeCallback = _options$nodeCallback === void 0 ? noop$2 : _options$nodeCallback,
	      _options$pseudoElemen = options.pseudoElementsCallback,
	      pseudoElementsCallback = _options$pseudoElemen === void 0 ? noop$2 : _options$pseudoElemen,
	      _options$observeMutat = options.observeMutationsRoot,
	      observeMutationsRoot = _options$observeMutat === void 0 ? DOCUMENT : _options$observeMutat;
	  mo = new MUTATION_OBSERVER(function (objects) {
	    if (disabled) return;
	    var defaultPrefix = getDefaultUsablePrefix();
	    toArray(objects).forEach(function (mutationRecord) {
	      if (mutationRecord.type === 'childList' && mutationRecord.addedNodes.length > 0 && !isWatched(mutationRecord.addedNodes[0])) {
	        if (config.searchPseudoElements) {
	          pseudoElementsCallback(mutationRecord.target);
	        }

	        treeCallback(mutationRecord.target);
	      }

	      if (mutationRecord.type === 'attributes' && mutationRecord.target.parentNode && config.searchPseudoElements) {
	        pseudoElementsCallback(mutationRecord.target.parentNode);
	      }

	      if (mutationRecord.type === 'attributes' && isWatched(mutationRecord.target) && ~ATTRIBUTES_WATCHED_FOR_MUTATION.indexOf(mutationRecord.attributeName)) {
	        if (mutationRecord.attributeName === 'class' && hasPrefixAndIcon(mutationRecord.target)) {
	          var _getCanonicalIcon = getCanonicalIcon(classArray(mutationRecord.target)),
	              prefix = _getCanonicalIcon.prefix,
	              iconName = _getCanonicalIcon.iconName;

	          mutationRecord.target.setAttribute(DATA_PREFIX, prefix || defaultPrefix);
	          if (iconName) mutationRecord.target.setAttribute(DATA_ICON, iconName);
	        } else if (hasBeenReplaced(mutationRecord.target)) {
	          nodeCallback(mutationRecord.target);
	        }
	      }
	    });
	  });
	  if (!IS_DOM) return;
	  mo.observe(observeMutationsRoot, {
	    childList: true,
	    attributes: true,
	    characterData: true,
	    subtree: true
	  });
	}
	function disconnect() {
	  if (!mo) return;
	  mo.disconnect();
	}

	function styleParser (node) {
	  var style = node.getAttribute('style');
	  var val = [];

	  if (style) {
	    val = style.split(';').reduce(function (acc, style) {
	      var styles = style.split(':');
	      var prop = styles[0];
	      var value = styles.slice(1);

	      if (prop && value.length > 0) {
	        acc[prop] = value.join(':').trim();
	      }

	      return acc;
	    }, {});
	  }

	  return val;
	}

	function classParser (node) {
	  var existingPrefix = node.getAttribute('data-prefix');
	  var existingIconName = node.getAttribute('data-icon');
	  var innerText = node.innerText !== undefined ? node.innerText.trim() : '';
	  var val = getCanonicalIcon(classArray(node));

	  if (!val.prefix) {
	    val.prefix = getDefaultUsablePrefix();
	  }

	  if (existingPrefix && existingIconName) {
	    val.prefix = existingPrefix;
	    val.iconName = existingIconName;
	  }

	  if (val.iconName && val.prefix) {
	    return val;
	  }

	  if (val.prefix && innerText.length > 0) {
	    val.iconName = byLigature(val.prefix, node.innerText) || byUnicode(val.prefix, toHex(node.innerText));
	  }

	  if (!val.iconName && config.autoFetchSvg && node.firstChild && node.firstChild.nodeType === Node.TEXT_NODE) {
	    val.iconName = node.firstChild.data;
	  }

	  return val;
	}

	function attributesParser (node) {
	  var extraAttributes = toArray(node.attributes).reduce(function (acc, attr) {
	    if (acc.name !== 'class' && acc.name !== 'style') {
	      acc[attr.name] = attr.value;
	    }

	    return acc;
	  }, {});
	  var title = node.getAttribute('title');
	  var titleId = node.getAttribute('data-fa-title-id');

	  if (config.autoA11y) {
	    if (title) {
	      extraAttributes['aria-labelledby'] = "".concat(config.replacementClass, "-title-").concat(titleId || nextUniqueId());
	    } else {
	      extraAttributes['aria-hidden'] = 'true';
	      extraAttributes['focusable'] = 'false';
	    }
	  }

	  return extraAttributes;
	}

	function blankMeta() {
	  return {
	    iconName: null,
	    title: null,
	    titleId: null,
	    prefix: null,
	    transform: meaninglessTransform,
	    symbol: false,
	    mask: {
	      iconName: null,
	      prefix: null,
	      rest: []
	    },
	    maskId: null,
	    extra: {
	      classes: [],
	      styles: {},
	      attributes: {}
	    }
	  };
	}
	function parseMeta(node) {
	  var parser = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
	    styleParser: true
	  };

	  var _classParser = classParser(node),
	      iconName = _classParser.iconName,
	      prefix = _classParser.prefix,
	      extraClasses = _classParser.rest;

	  var extraAttributes = attributesParser(node);
	  var pluginMeta = chainHooks('parseNodeAttributes', {}, node);
	  var extraStyles = parser.styleParser ? styleParser(node) : [];
	  return _objectSpread2({
	    iconName: iconName,
	    title: node.getAttribute('title'),
	    titleId: node.getAttribute('data-fa-title-id'),
	    prefix: prefix,
	    transform: meaninglessTransform,
	    mask: {
	      iconName: null,
	      prefix: null,
	      rest: []
	    },
	    maskId: null,
	    symbol: false,
	    extra: {
	      classes: extraClasses,
	      styles: extraStyles,
	      attributes: extraAttributes
	    }
	  }, pluginMeta);
	}

	var styles$2 = namespace.styles;

	function generateMutation(node) {
	  var nodeMeta = config.autoReplaceSvg === 'nest' ? parseMeta(node, {
	    styleParser: false
	  }) : parseMeta(node);

	  if (~nodeMeta.extra.classes.indexOf(LAYERS_TEXT_CLASSNAME)) {
	    return callProvided('generateLayersText', node, nodeMeta);
	  } else {
	    return callProvided('generateSvgReplacementMutation', node, nodeMeta);
	  }
	}

	var knownPrefixes = new Set();
	FAMILIES.map(function (family) {
	  knownPrefixes.add("fa-".concat(family));
	});
	Object.keys(PREFIX_TO_STYLE[FAMILY_CLASSIC]).map(knownPrefixes.add.bind(knownPrefixes));
	Object.keys(PREFIX_TO_STYLE[FAMILY_SHARP]).map(knownPrefixes.add.bind(knownPrefixes));
	knownPrefixes = _toConsumableArray(knownPrefixes);

	function onTree(root) {
	  var callback = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
	  if (!IS_DOM) return Promise.resolve();
	  var htmlClassList = DOCUMENT.documentElement.classList;

	  var hclAdd = function hclAdd(suffix) {
	    return htmlClassList.add("".concat(HTML_CLASS_I2SVG_BASE_CLASS, "-").concat(suffix));
	  };

	  var hclRemove = function hclRemove(suffix) {
	    return htmlClassList.remove("".concat(HTML_CLASS_I2SVG_BASE_CLASS, "-").concat(suffix));
	  };

	  var prefixes = config.autoFetchSvg ? knownPrefixes : FAMILIES.map(function (f) {
	    return "fa-".concat(f);
	  }).concat(Object.keys(styles$2));

	  if (!prefixes.includes('fa')) {
	    prefixes.push('fa');
	  }

	  var prefixesDomQuery = [".".concat(LAYERS_TEXT_CLASSNAME, ":not([").concat(DATA_FA_I2SVG, "])")].concat(prefixes.map(function (p) {
	    return ".".concat(p, ":not([").concat(DATA_FA_I2SVG, "])");
	  })).join(', ');

	  if (prefixesDomQuery.length === 0) {
	    return Promise.resolve();
	  }

	  var candidates = [];

	  try {
	    candidates = toArray(root.querySelectorAll(prefixesDomQuery));
	  } catch (e) {// noop
	  }

	  if (candidates.length > 0) {
	    hclAdd('pending');
	    hclRemove('complete');
	  } else {
	    return Promise.resolve();
	  }

	  var mark = perf.begin('onTree');
	  var mutations = candidates.reduce(function (acc, node) {
	    try {
	      var mutation = generateMutation(node);

	      if (mutation) {
	        acc.push(mutation);
	      }
	    } catch (e) {
	      if (!PRODUCTION$1) {
	        if (e.name === 'MissingIcon') {
	          console.error(e);
	        }
	      }
	    }

	    return acc;
	  }, []);
	  return new Promise(function (resolve, reject) {
	    Promise.all(mutations).then(function (resolvedMutations) {
	      perform(resolvedMutations, function () {
	        hclAdd('active');
	        hclAdd('complete');
	        hclRemove('pending');
	        if (typeof callback === 'function') callback();
	        mark();
	        resolve();
	      });
	    }).catch(function (e) {
	      mark();
	      reject(e);
	    });
	  });
	}

	function onNode(node) {
	  var callback = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
	  generateMutation(node).then(function (mutation) {
	    if (mutation) {
	      perform([mutation], callback);
	    }
	  });
	}

	function resolveIcons(next) {
	  return function (maybeIconDefinition) {
	    var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	    var iconDefinition = (maybeIconDefinition || {}).icon ? maybeIconDefinition : findIconDefinition(maybeIconDefinition || {});
	    var mask = params.mask;

	    if (mask) {
	      mask = (mask || {}).icon ? mask : findIconDefinition(mask || {});
	    }

	    return next(iconDefinition, _objectSpread2(_objectSpread2({}, params), {}, {
	      mask: mask
	    }));
	  };
	}

	var render = function render(iconDefinition) {
	  var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	  var _params$transform = params.transform,
	      transform = _params$transform === void 0 ? meaninglessTransform : _params$transform,
	      _params$symbol = params.symbol,
	      symbol = _params$symbol === void 0 ? false : _params$symbol,
	      _params$mask = params.mask,
	      mask = _params$mask === void 0 ? null : _params$mask,
	      _params$maskId = params.maskId,
	      maskId = _params$maskId === void 0 ? null : _params$maskId,
	      _params$title = params.title,
	      title = _params$title === void 0 ? null : _params$title,
	      _params$titleId = params.titleId,
	      titleId = _params$titleId === void 0 ? null : _params$titleId,
	      _params$classes = params.classes,
	      classes = _params$classes === void 0 ? [] : _params$classes,
	      _params$attributes = params.attributes,
	      attributes = _params$attributes === void 0 ? {} : _params$attributes,
	      _params$styles = params.styles,
	      styles = _params$styles === void 0 ? {} : _params$styles;
	  if (!iconDefinition) return;
	  var prefix = iconDefinition.prefix,
	      iconName = iconDefinition.iconName,
	      icon = iconDefinition.icon;
	  return domVariants(_objectSpread2({
	    type: 'icon'
	  }, iconDefinition), function () {
	    callHooks('beforeDOMElementCreation', {
	      iconDefinition: iconDefinition,
	      params: params
	    });

	    if (config.autoA11y) {
	      if (title) {
	        attributes['aria-labelledby'] = "".concat(config.replacementClass, "-title-").concat(titleId || nextUniqueId());
	      } else {
	        attributes['aria-hidden'] = 'true';
	        attributes['focusable'] = 'false';
	      }
	    }

	    return makeInlineSvgAbstract({
	      icons: {
	        main: asFoundIcon(icon),
	        mask: mask ? asFoundIcon(mask.icon) : {
	          found: false,
	          width: null,
	          height: null,
	          icon: {}
	        }
	      },
	      prefix: prefix,
	      iconName: iconName,
	      transform: _objectSpread2(_objectSpread2({}, meaninglessTransform), transform),
	      symbol: symbol,
	      title: title,
	      maskId: maskId,
	      titleId: titleId,
	      extra: {
	        attributes: attributes,
	        styles: styles,
	        classes: classes
	      }
	    });
	  });
	};
	var ReplaceElements = {
	  mixout: function mixout() {
	    return {
	      icon: resolveIcons(render)
	    };
	  },
	  hooks: function hooks() {
	    return {
	      mutationObserverCallbacks: function mutationObserverCallbacks(accumulator) {
	        accumulator.treeCallback = onTree;
	        accumulator.nodeCallback = onNode;
	        return accumulator;
	      }
	    };
	  },
	  provides: function provides(providers$$1) {
	    providers$$1.i2svg = function (params) {
	      var _params$node = params.node,
	          node = _params$node === void 0 ? DOCUMENT : _params$node,
	          _params$callback = params.callback,
	          callback = _params$callback === void 0 ? function () {} : _params$callback;
	      return onTree(node, callback);
	    };

	    providers$$1.generateSvgReplacementMutation = function (node, nodeMeta) {
	      var iconName = nodeMeta.iconName,
	          title = nodeMeta.title,
	          titleId = nodeMeta.titleId,
	          prefix = nodeMeta.prefix,
	          transform = nodeMeta.transform,
	          symbol = nodeMeta.symbol,
	          mask = nodeMeta.mask,
	          maskId = nodeMeta.maskId,
	          extra = nodeMeta.extra;
	      return new Promise(function (resolve, reject) {
	        Promise.all([findIcon(iconName, prefix), mask.iconName ? findIcon(mask.iconName, mask.prefix) : Promise.resolve({
	          found: false,
	          width: 512,
	          height: 512,
	          icon: {}
	        })]).then(function (_ref) {
	          var _ref2 = _slicedToArray(_ref, 2),
	              main = _ref2[0],
	              mask = _ref2[1];

	          resolve([node, makeInlineSvgAbstract({
	            icons: {
	              main: main,
	              mask: mask
	            },
	            prefix: prefix,
	            iconName: iconName,
	            transform: transform,
	            symbol: symbol,
	            maskId: maskId,
	            title: title,
	            titleId: titleId,
	            extra: extra,
	            watchable: true
	          })]);
	        }).catch(reject);
	      });
	    };

	    providers$$1.generateAbstractIcon = function (_ref3) {
	      var children = _ref3.children,
	          attributes = _ref3.attributes,
	          main = _ref3.main,
	          transform = _ref3.transform,
	          styles = _ref3.styles;
	      var styleString = joinStyles(styles);

	      if (styleString.length > 0) {
	        attributes['style'] = styleString;
	      }

	      var nextChild;

	      if (transformIsMeaningful(transform)) {
	        nextChild = callProvided('generateAbstractTransformGrouping', {
	          main: main,
	          transform: transform,
	          containerWidth: main.width,
	          iconWidth: main.width
	        });
	      }

	      children.push(nextChild || main.icon);
	      return {
	        children: children,
	        attributes: attributes
	      };
	    };
	  }
	};

	var Layers = {
	  mixout: function mixout() {
	    return {
	      layer: function layer(assembler) {
	        var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	        var _params$classes = params.classes,
	            classes = _params$classes === void 0 ? [] : _params$classes;
	        return domVariants({
	          type: 'layer'
	        }, function () {
	          callHooks('beforeDOMElementCreation', {
	            assembler: assembler,
	            params: params
	          });
	          var children = [];
	          assembler(function (args) {
	            Array.isArray(args) ? args.map(function (a) {
	              children = children.concat(a.abstract);
	            }) : children = children.concat(args.abstract);
	          });
	          return [{
	            tag: 'span',
	            attributes: {
	              class: ["".concat(config.cssPrefix, "-layers")].concat(_toConsumableArray(classes)).join(' ')
	            },
	            children: children
	          }];
	        });
	      }
	    };
	  }
	};

	var LayersCounter = {
	  mixout: function mixout() {
	    return {
	      counter: function counter(content) {
	        var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	        var _params$title = params.title,
	            title = _params$title === void 0 ? null : _params$title,
	            _params$classes = params.classes,
	            classes = _params$classes === void 0 ? [] : _params$classes,
	            _params$attributes = params.attributes,
	            attributes = _params$attributes === void 0 ? {} : _params$attributes,
	            _params$styles = params.styles,
	            styles = _params$styles === void 0 ? {} : _params$styles;
	        return domVariants({
	          type: 'counter',
	          content: content
	        }, function () {
	          callHooks('beforeDOMElementCreation', {
	            content: content,
	            params: params
	          });
	          return makeLayersCounterAbstract({
	            content: content.toString(),
	            title: title,
	            extra: {
	              attributes: attributes,
	              styles: styles,
	              classes: ["".concat(config.cssPrefix, "-layers-counter")].concat(_toConsumableArray(classes))
	            }
	          });
	        });
	      }
	    };
	  }
	};

	var LayersText = {
	  mixout: function mixout() {
	    return {
	      text: function text(content) {
	        var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
	        var _params$transform = params.transform,
	            transform = _params$transform === void 0 ? meaninglessTransform : _params$transform,
	            _params$title = params.title,
	            title = _params$title === void 0 ? null : _params$title,
	            _params$classes = params.classes,
	            classes = _params$classes === void 0 ? [] : _params$classes,
	            _params$attributes = params.attributes,
	            attributes = _params$attributes === void 0 ? {} : _params$attributes,
	            _params$styles = params.styles,
	            styles = _params$styles === void 0 ? {} : _params$styles;
	        return domVariants({
	          type: 'text',
	          content: content
	        }, function () {
	          callHooks('beforeDOMElementCreation', {
	            content: content,
	            params: params
	          });
	          return makeLayersTextAbstract({
	            content: content,
	            transform: _objectSpread2(_objectSpread2({}, meaninglessTransform), transform),
	            title: title,
	            extra: {
	              attributes: attributes,
	              styles: styles,
	              classes: ["".concat(config.cssPrefix, "-layers-text")].concat(_toConsumableArray(classes))
	            }
	          });
	        });
	      }
	    };
	  },
	  provides: function provides(providers$$1) {
	    providers$$1.generateLayersText = function (node, nodeMeta) {
	      var title = nodeMeta.title,
	          transform = nodeMeta.transform,
	          extra = nodeMeta.extra;
	      var width = null;
	      var height = null;

	      if (IS_IE) {
	        var computedFontSize = parseInt(getComputedStyle(node).fontSize, 10);
	        var boundingClientRect = node.getBoundingClientRect();
	        width = boundingClientRect.width / computedFontSize;
	        height = boundingClientRect.height / computedFontSize;
	      }

	      if (config.autoA11y && !title) {
	        extra.attributes['aria-hidden'] = 'true';
	      }

	      return Promise.resolve([node, makeLayersTextAbstract({
	        content: node.innerHTML,
	        width: width,
	        height: height,
	        transform: transform,
	        title: title,
	        extra: extra,
	        watchable: true
	      })]);
	    };
	  }
	};

	var CLEAN_CONTENT_PATTERN = new RegExp("\"", 'ug');
	var SECONDARY_UNICODE_RANGE = [1105920, 1112319];
	function hexValueFromContent(content) {
	  var cleaned = content.replace(CLEAN_CONTENT_PATTERN, '');
	  var codePoint = codePointAt(cleaned, 0);
	  var isPrependTen = codePoint >= SECONDARY_UNICODE_RANGE[0] && codePoint <= SECONDARY_UNICODE_RANGE[1];
	  var isDoubled = cleaned.length === 2 ? cleaned[0] === cleaned[1] : false;
	  return {
	    value: isDoubled ? toHex(cleaned[0]) : toHex(cleaned),
	    isSecondary: isPrependTen || isDoubled
	  };
	}

	function replaceForPosition(node, position) {
	  var pendingAttribute = "".concat(DATA_FA_PSEUDO_ELEMENT_PENDING).concat(position.replace(':', '-'));
	  return new Promise(function (resolve, reject) {
	    if (node.getAttribute(pendingAttribute) !== null) {
	      // This node is already being processed
	      return resolve();
	    }

	    var children = toArray(node.children);
	    var alreadyProcessedPseudoElement = children.filter(function (c) {
	      return c.getAttribute(DATA_FA_PSEUDO_ELEMENT) === position;
	    })[0];
	    var styles = WINDOW.getComputedStyle(node, position);
	    var fontFamily = styles.getPropertyValue('font-family').match(FONT_FAMILY_PATTERN);
	    var fontWeight = styles.getPropertyValue('font-weight');
	    var content = styles.getPropertyValue('content');

	    if (alreadyProcessedPseudoElement && !fontFamily) {
	      // If we've already processed it but the current computed style does not result in a font-family,
	      // that probably means that a class name that was previously present to make the icon has been
	      // removed. So we now should delete the icon.
	      node.removeChild(alreadyProcessedPseudoElement);
	      return resolve();
	    } else if (fontFamily && content !== 'none' && content !== '') {
	      var _content = styles.getPropertyValue('content');

	      var family = ~['Sharp'].indexOf(fontFamily[2]) ? FAMILY_SHARP : FAMILY_CLASSIC;
	      var prefix = ~['Solid', 'Regular', 'Light', 'Thin', 'Duotone', 'Brands', 'Kit'].indexOf(fontFamily[2]) ? STYLE_TO_PREFIX[family][fontFamily[2].toLowerCase()] : FONT_WEIGHT_TO_PREFIX[family][fontWeight];

	      var _hexValueFromContent = hexValueFromContent(_content),
	          hexValue = _hexValueFromContent.value,
	          isSecondary = _hexValueFromContent.isSecondary;

	      var isV4 = fontFamily[0].startsWith('FontAwesome');
	      var iconName = byUnicode(prefix, hexValue);
	      var iconIdentifier = iconName;

	      if (isV4) {
	        var iconName4 = byOldUnicode(hexValue);

	        if (iconName4.iconName && iconName4.prefix) {
	          iconName = iconName4.iconName;
	          prefix = iconName4.prefix;
	        }
	      } // Only convert the pseudo element in this ::before/::after position into an icon if we haven't
	      // already done so with the same prefix and iconName


	      if (iconName && !isSecondary && (!alreadyProcessedPseudoElement || alreadyProcessedPseudoElement.getAttribute(DATA_PREFIX) !== prefix || alreadyProcessedPseudoElement.getAttribute(DATA_ICON) !== iconIdentifier)) {
	        node.setAttribute(pendingAttribute, iconIdentifier);

	        if (alreadyProcessedPseudoElement) {
	          // Delete the old one, since we're replacing it with a new one
	          node.removeChild(alreadyProcessedPseudoElement);
	        }

	        var meta = blankMeta();
	        var extra = meta.extra;
	        extra.attributes[DATA_FA_PSEUDO_ELEMENT] = position;
	        findIcon(iconName, prefix).then(function (main) {
	          var _abstract = makeInlineSvgAbstract(_objectSpread2(_objectSpread2({}, meta), {}, {
	            icons: {
	              main: main,
	              mask: emptyCanonicalIcon()
	            },
	            prefix: prefix,
	            iconName: iconIdentifier,
	            extra: extra,
	            watchable: true
	          }));

	          var element = DOCUMENT.createElementNS('http://www.w3.org/2000/svg', 'svg');

	          if (position === '::before') {
	            node.insertBefore(element, node.firstChild);
	          } else {
	            node.appendChild(element);
	          }

	          element.outerHTML = _abstract.map(function (a) {
	            return toHtml(a);
	          }).join('\n');
	          node.removeAttribute(pendingAttribute);
	          resolve();
	        }).catch(reject);
	      } else {
	        resolve();
	      }
	    } else {
	      resolve();
	    }
	  });
	}

	function replace(node) {
	  return Promise.all([replaceForPosition(node, '::before'), replaceForPosition(node, '::after')]);
	}

	function processable(node) {
	  return node.parentNode !== document.head && !~TAGNAMES_TO_SKIP_FOR_PSEUDOELEMENTS.indexOf(node.tagName.toUpperCase()) && !node.getAttribute(DATA_FA_PSEUDO_ELEMENT) && (!node.parentNode || node.parentNode.tagName !== 'svg');
	}

	function searchPseudoElements(root) {
	  if (!IS_DOM) return;
	  return new Promise(function (resolve, reject) {
	    var operations = toArray(root.querySelectorAll('*')).filter(processable).map(replace);
	    var end = perf.begin('searchPseudoElements');
	    disableObservation();
	    Promise.all(operations).then(function () {
	      end();
	      enableObservation();
	      resolve();
	    }).catch(function () {
	      end();
	      enableObservation();
	      reject();
	    });
	  });
	}

	var PseudoElements = {
	  hooks: function hooks() {
	    return {
	      mutationObserverCallbacks: function mutationObserverCallbacks(accumulator) {
	        accumulator.pseudoElementsCallback = searchPseudoElements;
	        return accumulator;
	      }
	    };
	  },
	  provides: function provides(providers$$1) {
	    providers$$1.pseudoElements2svg = function (params) {
	      var _params$node = params.node,
	          node = _params$node === void 0 ? DOCUMENT : _params$node;

	      if (config.searchPseudoElements) {
	        searchPseudoElements(node);
	      }
	    };
	  }
	};

	var _unwatched = false;
	var MutationObserver$1 = {
	  mixout: function mixout() {
	    return {
	      dom: {
	        unwatch: function unwatch() {
	          disableObservation();
	          _unwatched = true;
	        }
	      }
	    };
	  },
	  hooks: function hooks() {
	    return {
	      bootstrap: function bootstrap() {
	        observe(chainHooks('mutationObserverCallbacks', {}));
	      },
	      noAuto: function noAuto() {
	        disconnect();
	      },
	      watch: function watch(params) {
	        var observeMutationsRoot = params.observeMutationsRoot;

	        if (_unwatched) {
	          enableObservation();
	        } else {
	          observe(chainHooks('mutationObserverCallbacks', {
	            observeMutationsRoot: observeMutationsRoot
	          }));
	        }
	      }
	    };
	  }
	};

	var parseTransformString = function parseTransformString(transformString) {
	  var transform = {
	    size: 16,
	    x: 0,
	    y: 0,
	    flipX: false,
	    flipY: false,
	    rotate: 0
	  };
	  return transformString.toLowerCase().split(' ').reduce(function (acc, n) {
	    var parts = n.toLowerCase().split('-');
	    var first = parts[0];
	    var rest = parts.slice(1).join('-');

	    if (first && rest === 'h') {
	      acc.flipX = true;
	      return acc;
	    }

	    if (first && rest === 'v') {
	      acc.flipY = true;
	      return acc;
	    }

	    rest = parseFloat(rest);

	    if (isNaN(rest)) {
	      return acc;
	    }

	    switch (first) {
	      case 'grow':
	        acc.size = acc.size + rest;
	        break;

	      case 'shrink':
	        acc.size = acc.size - rest;
	        break;

	      case 'left':
	        acc.x = acc.x - rest;
	        break;

	      case 'right':
	        acc.x = acc.x + rest;
	        break;

	      case 'up':
	        acc.y = acc.y - rest;
	        break;

	      case 'down':
	        acc.y = acc.y + rest;
	        break;

	      case 'rotate':
	        acc.rotate = acc.rotate + rest;
	        break;
	    }

	    return acc;
	  }, transform);
	};
	var PowerTransforms = {
	  mixout: function mixout() {
	    return {
	      parse: {
	        transform: function transform(transformString) {
	          return parseTransformString(transformString);
	        }
	      }
	    };
	  },
	  hooks: function hooks() {
	    return {
	      parseNodeAttributes: function parseNodeAttributes(accumulator, node) {
	        var transformString = node.getAttribute('data-fa-transform');

	        if (transformString) {
	          accumulator.transform = parseTransformString(transformString);
	        }

	        return accumulator;
	      }
	    };
	  },
	  provides: function provides(providers) {
	    providers.generateAbstractTransformGrouping = function (_ref) {
	      var main = _ref.main,
	          transform = _ref.transform,
	          containerWidth = _ref.containerWidth,
	          iconWidth = _ref.iconWidth;
	      var outer = {
	        transform: "translate(".concat(containerWidth / 2, " 256)")
	      };
	      var innerTranslate = "translate(".concat(transform.x * 32, ", ").concat(transform.y * 32, ") ");
	      var innerScale = "scale(".concat(transform.size / 16 * (transform.flipX ? -1 : 1), ", ").concat(transform.size / 16 * (transform.flipY ? -1 : 1), ") ");
	      var innerRotate = "rotate(".concat(transform.rotate, " 0 0)");
	      var inner = {
	        transform: "".concat(innerTranslate, " ").concat(innerScale, " ").concat(innerRotate)
	      };
	      var path = {
	        transform: "translate(".concat(iconWidth / 2 * -1, " -256)")
	      };
	      var operations = {
	        outer: outer,
	        inner: inner,
	        path: path
	      };
	      return {
	        tag: 'g',
	        attributes: _objectSpread2({}, operations.outer),
	        children: [{
	          tag: 'g',
	          attributes: _objectSpread2({}, operations.inner),
	          children: [{
	            tag: main.icon.tag,
	            children: main.icon.children,
	            attributes: _objectSpread2(_objectSpread2({}, main.icon.attributes), operations.path)
	          }]
	        }]
	      };
	    };
	  }
	};

	var ALL_SPACE = {
	  x: 0,
	  y: 0,
	  width: '100%',
	  height: '100%'
	};

	function fillBlack(_abstract) {
	  var force = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

	  if (_abstract.attributes && (_abstract.attributes.fill || force)) {
	    _abstract.attributes.fill = 'black';
	  }

	  return _abstract;
	}

	function deGroup(_abstract2) {
	  if (_abstract2.tag === 'g') {
	    return _abstract2.children;
	  } else {
	    return [_abstract2];
	  }
	}

	var Masks = {
	  hooks: function hooks() {
	    return {
	      parseNodeAttributes: function parseNodeAttributes(accumulator, node) {
	        var maskData = node.getAttribute('data-fa-mask');
	        var mask = !maskData ? emptyCanonicalIcon() : getCanonicalIcon(maskData.split(' ').map(function (i) {
	          return i.trim();
	        }));

	        if (!mask.prefix) {
	          mask.prefix = getDefaultUsablePrefix();
	        }

	        accumulator.mask = mask;
	        accumulator.maskId = node.getAttribute('data-fa-mask-id');
	        return accumulator;
	      }
	    };
	  },
	  provides: function provides(providers) {
	    providers.generateAbstractMask = function (_ref) {
	      var children = _ref.children,
	          attributes = _ref.attributes,
	          main = _ref.main,
	          mask = _ref.mask,
	          explicitMaskId = _ref.maskId,
	          transform = _ref.transform;
	      var mainWidth = main.width,
	          mainPath = main.icon;
	      var maskWidth = mask.width,
	          maskPath = mask.icon;
	      var trans = transformForSvg({
	        transform: transform,
	        containerWidth: maskWidth,
	        iconWidth: mainWidth
	      });
	      var maskRect = {
	        tag: 'rect',
	        attributes: _objectSpread2(_objectSpread2({}, ALL_SPACE), {}, {
	          fill: 'white'
	        })
	      };
	      var maskInnerGroupChildrenMixin = mainPath.children ? {
	        children: mainPath.children.map(fillBlack)
	      } : {};
	      var maskInnerGroup = {
	        tag: 'g',
	        attributes: _objectSpread2({}, trans.inner),
	        children: [fillBlack(_objectSpread2({
	          tag: mainPath.tag,
	          attributes: _objectSpread2(_objectSpread2({}, mainPath.attributes), trans.path)
	        }, maskInnerGroupChildrenMixin))]
	      };
	      var maskOuterGroup = {
	        tag: 'g',
	        attributes: _objectSpread2({}, trans.outer),
	        children: [maskInnerGroup]
	      };
	      var maskId = "mask-".concat(explicitMaskId || nextUniqueId());
	      var clipId = "clip-".concat(explicitMaskId || nextUniqueId());
	      var maskTag = {
	        tag: 'mask',
	        attributes: _objectSpread2(_objectSpread2({}, ALL_SPACE), {}, {
	          id: maskId,
	          maskUnits: 'userSpaceOnUse',
	          maskContentUnits: 'userSpaceOnUse'
	        }),
	        children: [maskRect, maskOuterGroup]
	      };
	      var defs = {
	        tag: 'defs',
	        children: [{
	          tag: 'clipPath',
	          attributes: {
	            id: clipId
	          },
	          children: deGroup(maskPath)
	        }, maskTag]
	      };
	      children.push(defs, {
	        tag: 'rect',
	        attributes: _objectSpread2({
	          fill: 'currentColor',
	          'clip-path': "url(#".concat(clipId, ")"),
	          mask: "url(#".concat(maskId, ")")
	        }, ALL_SPACE)
	      });
	      return {
	        children: children,
	        attributes: attributes
	      };
	    };
	  }
	};

	var MissingIconIndicator = {
	  provides: function provides(providers) {
	    var reduceMotion = false;

	    if (WINDOW.matchMedia) {
	      reduceMotion = WINDOW.matchMedia('(prefers-reduced-motion: reduce)').matches;
	    }

	    providers.missingIconAbstract = function () {
	      var gChildren = [];
	      var FILL = {
	        fill: 'currentColor'
	      };
	      var ANIMATION_BASE = {
	        attributeType: 'XML',
	        repeatCount: 'indefinite',
	        dur: '2s'
	      }; // Ring

	      gChildren.push({
	        tag: 'path',
	        attributes: _objectSpread2(_objectSpread2({}, FILL), {}, {
	          d: 'M156.5,447.7l-12.6,29.5c-18.7-9.5-35.9-21.2-51.5-34.9l22.7-22.7C127.6,430.5,141.5,440,156.5,447.7z M40.6,272H8.5 c1.4,21.2,5.4,41.7,11.7,61.1L50,321.2C45.1,305.5,41.8,289,40.6,272z M40.6,240c1.4-18.8,5.2-37,11.1-54.1l-29.5-12.6 C14.7,194.3,10,216.7,8.5,240H40.6z M64.3,156.5c7.8-14.9,17.2-28.8,28.1-41.5L69.7,92.3c-13.7,15.6-25.5,32.8-34.9,51.5 L64.3,156.5z M397,419.6c-13.9,12-29.4,22.3-46.1,30.4l11.9,29.8c20.7-9.9,39.8-22.6,56.9-37.6L397,419.6z M115,92.4 c13.9-12,29.4-22.3,46.1-30.4l-11.9-29.8c-20.7,9.9-39.8,22.6-56.8,37.6L115,92.4z M447.7,355.5c-7.8,14.9-17.2,28.8-28.1,41.5 l22.7,22.7c13.7-15.6,25.5-32.9,34.9-51.5L447.7,355.5z M471.4,272c-1.4,18.8-5.2,37-11.1,54.1l29.5,12.6 c7.5-21.1,12.2-43.5,13.6-66.8H471.4z M321.2,462c-15.7,5-32.2,8.2-49.2,9.4v32.1c21.2-1.4,41.7-5.4,61.1-11.7L321.2,462z M240,471.4c-18.8-1.4-37-5.2-54.1-11.1l-12.6,29.5c21.1,7.5,43.5,12.2,66.8,13.6V471.4z M462,190.8c5,15.7,8.2,32.2,9.4,49.2h32.1 c-1.4-21.2-5.4-41.7-11.7-61.1L462,190.8z M92.4,397c-12-13.9-22.3-29.4-30.4-46.1l-29.8,11.9c9.9,20.7,22.6,39.8,37.6,56.9 L92.4,397z M272,40.6c18.8,1.4,36.9,5.2,54.1,11.1l12.6-29.5C317.7,14.7,295.3,10,272,8.5V40.6z M190.8,50 c15.7-5,32.2-8.2,49.2-9.4V8.5c-21.2,1.4-41.7,5.4-61.1,11.7L190.8,50z M442.3,92.3L419.6,115c12,13.9,22.3,29.4,30.5,46.1 l29.8-11.9C470,128.5,457.3,109.4,442.3,92.3z M397,92.4l22.7-22.7c-15.6-13.7-32.8-25.5-51.5-34.9l-12.6,29.5 C370.4,72.1,384.4,81.5,397,92.4z'
	        })
	      });

	      var OPACITY_ANIMATE = _objectSpread2(_objectSpread2({}, ANIMATION_BASE), {}, {
	        attributeName: 'opacity'
	      });

	      var dot = {
	        tag: 'circle',
	        attributes: _objectSpread2(_objectSpread2({}, FILL), {}, {
	          cx: '256',
	          cy: '364',
	          r: '28'
	        }),
	        children: []
	      };

	      if (!reduceMotion) {
	        dot.children.push({
	          tag: 'animate',
	          attributes: _objectSpread2(_objectSpread2({}, ANIMATION_BASE), {}, {
	            attributeName: 'r',
	            values: '28;14;28;28;14;28;'
	          })
	        }, {
	          tag: 'animate',
	          attributes: _objectSpread2(_objectSpread2({}, OPACITY_ANIMATE), {}, {
	            values: '1;0;1;1;0;1;'
	          })
	        });
	      }

	      gChildren.push(dot);
	      gChildren.push({
	        tag: 'path',
	        attributes: _objectSpread2(_objectSpread2({}, FILL), {}, {
	          opacity: '1',
	          d: 'M263.7,312h-16c-6.6,0-12-5.4-12-12c0-71,77.4-63.9,77.4-107.8c0-20-17.8-40.2-57.4-40.2c-29.1,0-44.3,9.6-59.2,28.7 c-3.9,5-11.1,6-16.2,2.4l-13.1-9.2c-5.6-3.9-6.9-11.8-2.6-17.2c21.2-27.2,46.4-44.7,91.2-44.7c52.3,0,97.4,29.8,97.4,80.2 c0,67.6-77.4,63.5-77.4,107.8C275.7,306.6,270.3,312,263.7,312z'
	        }),
	        children: reduceMotion ? [] : [{
	          tag: 'animate',
	          attributes: _objectSpread2(_objectSpread2({}, OPACITY_ANIMATE), {}, {
	            values: '1;0;0;0;0;1;'
	          })
	        }]
	      });

	      if (!reduceMotion) {
	        // Exclamation
	        gChildren.push({
	          tag: 'path',
	          attributes: _objectSpread2(_objectSpread2({}, FILL), {}, {
	            opacity: '0',
	            d: 'M232.5,134.5l7,168c0.3,6.4,5.6,11.5,12,11.5h9c6.4,0,11.7-5.1,12-11.5l7-168c0.3-6.8-5.2-12.5-12-12.5h-23 C237.7,122,232.2,127.7,232.5,134.5z'
	          }),
	          children: [{
	            tag: 'animate',
	            attributes: _objectSpread2(_objectSpread2({}, OPACITY_ANIMATE), {}, {
	              values: '0;0;1;1;0;0;'
	            })
	          }]
	        });
	      }

	      return {
	        tag: 'g',
	        attributes: {
	          'class': 'missing'
	        },
	        children: gChildren
	      };
	    };
	  }
	};

	var SvgSymbols = {
	  hooks: function hooks() {
	    return {
	      parseNodeAttributes: function parseNodeAttributes(accumulator, node) {
	        var symbolData = node.getAttribute('data-fa-symbol');
	        var symbol = symbolData === null ? false : symbolData === '' ? true : symbolData;
	        accumulator['symbol'] = symbol;
	        return accumulator;
	      }
	    };
	  }
	};

	var plugins = [InjectCSS, ReplaceElements, Layers, LayersCounter, LayersText, PseudoElements, MutationObserver$1, PowerTransforms, Masks, MissingIconIndicator, SvgSymbols];

	registerPlugins(plugins, {
	  mixoutsTo: api
	});
	api.noAuto;
	api.config;
	api.library;
	api.dom;
	var parse$1 = api.parse;
	api.findIconDefinition;
	api.toHtml;
	var icon = api.icon;
	api.layer;
	api.text;
	api.counter;

	let PRODUCTION = false;

	try {
	  PRODUCTION = process.env.NODE_ENV === 'production';
	} catch (e) {}

	function log(...args) {
	  if (!PRODUCTION && console && typeof console.error === 'function') {
	    console.error(...args);
	  }
	}

	// Normalize icon arguments
	function normalizeIconArgs(icon) {
	  // this has everything that it needs to be rendered which means it was probably imported
	  // directly from an icon svg package
	  if (icon && typeof icon === 'object' && icon.prefix && icon.iconName && icon.icon) {
	    return icon
	  }

	  if (parse$1.icon) {
	    return parse$1.icon(icon)
	  }

	  // if the icon is null, there's nothing to do
	  if (icon === null) {
	    return null
	  }

	  // if the icon is an object and has a prefix and an icon name, return it
	  if (icon && typeof icon === 'object' && icon.prefix && icon.iconName) {
	    return icon
	  }

	  // if it's an array with length of two
	  if (Array.isArray(icon) && icon.length === 2) {
	    // use the first item as prefix, second as icon name
	    return { prefix: icon[0], iconName: icon[1] }
	  }

	  // if it's a string, use it as the icon name
	  if (typeof icon === 'string') {
	    return { prefix: 'fas', iconName: icon }
	  }
	}

	// creates an object with a key of key
	// and a value of value
	// if certain conditions are met
	function objectWithKey(key, value) {
	  // if the value is a non-empty array
	  // or it's not an array but it is truthy
	  // then create the object with the key and the value
	  // if not, return an empty array
	  return (Array.isArray(value) && value.length > 0) ||
	    (!Array.isArray(value) && value)
	    ? { [key]: value }
	    : {}
	}

	/* node_modules/@fortawesome/svelte-fontawesome/src/components/SvgElement.svelte generated by Svelte v4.2.18 */

	const { Error: Error_1, Object: Object_1$4 } = globals;
	const file$t = "node_modules/@fortawesome/svelte-fontawesome/src/components/SvgElement.svelte";

	function create_fragment$u(ctx) {
		let svg;
		let svg_levels = [/*elementProps*/ ctx[2]];
		let svg_data = {};

		for (let i = 0; i < svg_levels.length; i += 1) {
			svg_data = assign(svg_data, svg_levels[i]);
		}

		const block = {
			c: function create() {
				svg = svg_element("svg");
				set_svg_attributes(svg, svg_data);
				add_location(svg, file$t, 32, 0, 860);
			},
			l: function claim(nodes) {
				throw new Error_1("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, svg, anchor);
				svg.innerHTML = /*markup*/ ctx[1];
				/*svg_binding*/ ctx[7](svg);
			},
			p: noop$3,
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(svg);
				}

				/*svg_binding*/ ctx[7](null);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$u.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$u($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('SvgElement', slots, []);
		let { tag } = $$props;
		let { props } = $$props;
		let { children } = $$props;
		let { style = null } = $$props;
		let { ref = null } = $$props;

		if (tag !== 'svg') {
			throw new Error('SvgElement requires a tag of "svg"');
		}

		function processChildren(children) {
			return children?.reduce(
				(acc, child) => {
					return acc + (child.tag ? generateMarkup(child) : child);
				},
				''
			) || '';
		}

		function generateMarkup({ tag, props, children }) {
			// Generate a string setting key = value for each prop
			const attributes = Object.keys(props).map(key => `${key}="${props[key]}"`).join(' ');

			return `<${tag} ${attributes}>${processChildren(children)}</${tag}>`;
		}

		const markup = processChildren(children);
		const elementStyle = (props?.style) ? `${props.style}${style || ''}` : style;
		const elementProps = { ...props, style: elementStyle };

		$$self.$$.on_mount.push(function () {
			if (tag === undefined && !('tag' in $$props || $$self.$$.bound[$$self.$$.props['tag']])) {
				console.warn("<SvgElement> was created without expected prop 'tag'");
			}

			if (props === undefined && !('props' in $$props || $$self.$$.bound[$$self.$$.props['props']])) {
				console.warn("<SvgElement> was created without expected prop 'props'");
			}

			if (children === undefined && !('children' in $$props || $$self.$$.bound[$$self.$$.props['children']])) {
				console.warn("<SvgElement> was created without expected prop 'children'");
			}
		});

		const writable_props = ['tag', 'props', 'children', 'style', 'ref'];

		Object_1$4.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<SvgElement> was created with unknown prop '${key}'`);
		});

		function svg_binding($$value) {
			binding_callbacks[$$value ? 'unshift' : 'push'](() => {
				ref = $$value;
				$$invalidate(0, ref);
			});
		}

		$$self.$$set = $$props => {
			if ('tag' in $$props) $$invalidate(3, tag = $$props.tag);
			if ('props' in $$props) $$invalidate(4, props = $$props.props);
			if ('children' in $$props) $$invalidate(5, children = $$props.children);
			if ('style' in $$props) $$invalidate(6, style = $$props.style);
			if ('ref' in $$props) $$invalidate(0, ref = $$props.ref);
		};

		$$self.$capture_state = () => ({
			tag,
			props,
			children,
			style,
			ref,
			processChildren,
			generateMarkup,
			markup,
			elementStyle,
			elementProps
		});

		$$self.$inject_state = $$props => {
			if ('tag' in $$props) $$invalidate(3, tag = $$props.tag);
			if ('props' in $$props) $$invalidate(4, props = $$props.props);
			if ('children' in $$props) $$invalidate(5, children = $$props.children);
			if ('style' in $$props) $$invalidate(6, style = $$props.style);
			if ('ref' in $$props) $$invalidate(0, ref = $$props.ref);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [ref, markup, elementProps, tag, props, children, style, svg_binding];
	}

	class SvgElement extends SvelteComponentDev {
		constructor(options) {
			super(options);

			init(this, options, instance$u, create_fragment$u, safe_not_equal, {
				tag: 3,
				props: 4,
				children: 5,
				style: 6,
				ref: 0
			});

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "SvgElement",
				options,
				id: create_fragment$u.name
			});
		}

		get tag() {
			return this.$$.ctx[3];
		}

		set tag(tag) {
			this.$$set({ tag });
			flush();
		}

		get props() {
			return this.$$.ctx[4];
		}

		set props(props) {
			this.$$set({ props });
			flush();
		}

		get children() {
			return this.$$.ctx[5];
		}

		set children(children) {
			this.$$set({ children });
			flush();
		}

		get style() {
			return this.$$.ctx[6];
		}

		set style(style) {
			this.$$set({ style });
			flush();
		}

		get ref() {
			return this.$$.ctx[0];
		}

		set ref(ref) {
			this.$$set({ ref });
			flush();
		}
	}

	create_custom_element(SvgElement, {"tag":{},"props":{},"children":{},"style":{},"ref":{}}, [], [], true);

	/* node_modules/@fortawesome/svelte-fontawesome/src/components/FontAwesomeIcon.svelte generated by Svelte v4.2.18 */

	// (101:0) {#if result}
	function create_if_block$d(ctx) {
		let svgelement;
		let updating_ref;
		let current;
		const svgelement_spread_levels = [/*result*/ ctx[2], { style: /*style*/ ctx[1] }];

		function svgelement_ref_binding(value) {
			/*svgelement_ref_binding*/ ctx[28](value);
		}

		let svgelement_props = {};

		for (let i = 0; i < svgelement_spread_levels.length; i += 1) {
			svgelement_props = assign(svgelement_props, svgelement_spread_levels[i]);
		}

		if (/*ref*/ ctx[0] !== void 0) {
			svgelement_props.ref = /*ref*/ ctx[0];
		}

		svgelement = new SvgElement({ props: svgelement_props, $$inline: true });
		binding_callbacks.push(() => bind(svgelement, 'ref', svgelement_ref_binding));

		const block = {
			c: function create() {
				create_component(svgelement.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(svgelement, target, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				const svgelement_changes = (dirty[0] & /*result, style*/ 6)
				? get_spread_update(svgelement_spread_levels, [
						dirty[0] & /*result*/ 4 && get_spread_object(/*result*/ ctx[2]),
						dirty[0] & /*style*/ 2 && { style: /*style*/ ctx[1] }
					])
				: {};

				if (!updating_ref && dirty[0] & /*ref*/ 1) {
					updating_ref = true;
					svgelement_changes.ref = /*ref*/ ctx[0];
					add_flush_callback(() => updating_ref = false);
				}

				svgelement.$set(svgelement_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(svgelement.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(svgelement.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(svgelement, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$d.name,
			type: "if",
			source: "(101:0) {#if result}",
			ctx
		});

		return block;
	}

	function create_fragment$t(ctx) {
		let if_block_anchor;
		let current;
		let if_block = /*result*/ ctx[2] && create_if_block$d(ctx);

		const block = {
			c: function create() {
				if (if_block) if_block.c();
				if_block_anchor = empty();
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				if (if_block) if_block.m(target, anchor);
				insert_dev(target, if_block_anchor, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				if (/*result*/ ctx[2]) {
					if (if_block) {
						if_block.p(ctx, dirty);

						if (dirty[0] & /*result*/ 4) {
							transition_in(if_block, 1);
						}
					} else {
						if_block = create_if_block$d(ctx);
						if_block.c();
						transition_in(if_block, 1);
						if_block.m(if_block_anchor.parentNode, if_block_anchor);
					}
				} else if (if_block) {
					group_outros();

					transition_out(if_block, 1, 1, () => {
						if_block = null;
					});

					check_outros();
				}
			},
			i: function intro(local) {
				if (current) return;
				transition_in(if_block);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(if_block_anchor);
				}

				if (if_block) if_block.d(detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$t.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$t($$self, $$props, $$invalidate) {
		const omit_props_names = [
			"border","mask","maskId","fixedWidth","inverse","flip","icon","listItem","pull","pulse","rotation","size","spin","spinPulse","spinReverse","beat","fade","beatFade","bounce","shake","symbol","title","titleId","transform","swapOpacity","ref","style"
		];

		let $$restProps = compute_rest_props($$props, omit_props_names);
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('FontAwesomeIcon', slots, []);
		let { border = false } = $$props;
		let { mask = null } = $$props;
		let { maskId = null } = $$props;
		let { fixedWidth = false } = $$props;
		let { inverse = false } = $$props;
		let { flip = false } = $$props;
		let { icon: icon$1 = null } = $$props;
		let { listItem = false } = $$props;
		let { pull = null } = $$props;
		let { pulse = false } = $$props;
		let { rotation = null } = $$props;
		let { size = null } = $$props;
		let { spin = false } = $$props;
		let { spinPulse = false } = $$props;
		let { spinReverse = false } = $$props;
		let { beat = false } = $$props;
		let { fade = false } = $$props;
		let { beatFade = false } = $$props;
		let { bounce = false } = $$props;
		let { shake = false } = $$props;
		let { symbol = false } = $$props;
		let { title = '' } = $$props;
		let { titleId = null } = $$props;
		let { transform = null } = $$props;
		let { swapOpacity = false } = $$props;
		let { ref = null } = $$props;
		let { style = null } = $$props;
		const iconLookup = normalizeIconArgs(icon$1);
		const classes = objectWithKey('classes', [...classList($$props), ...($$props.class || '').split(' ')]);

		const transformObj = objectWithKey('transform', typeof transform === 'string'
		? parse$1.transform(transform)
		: transform);

		const maskObj = objectWithKey('mask', normalizeIconArgs(mask));

		const renderedIcon = icon(iconLookup, {
			...classes,
			...transformObj,
			...maskObj,
			symbol,
			title,
			titleId,
			maskId
		});

		let result = null;

		if (!renderedIcon) {
			log('Could not find icon', iconLookup);
		} else {
			const { abstract } = renderedIcon;

			result = convert(
				(tag, props, children) => {
					return { tag, props, children };
				},
				abstract[0],
				$$restProps
			);
		}

		function svgelement_ref_binding(value) {
			ref = value;
			$$invalidate(0, ref);
		}

		$$self.$$set = $$new_props => {
			$$invalidate(35, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
			$$invalidate(34, $$restProps = compute_rest_props($$props, omit_props_names));
			if ('border' in $$new_props) $$invalidate(3, border = $$new_props.border);
			if ('mask' in $$new_props) $$invalidate(4, mask = $$new_props.mask);
			if ('maskId' in $$new_props) $$invalidate(5, maskId = $$new_props.maskId);
			if ('fixedWidth' in $$new_props) $$invalidate(6, fixedWidth = $$new_props.fixedWidth);
			if ('inverse' in $$new_props) $$invalidate(7, inverse = $$new_props.inverse);
			if ('flip' in $$new_props) $$invalidate(8, flip = $$new_props.flip);
			if ('icon' in $$new_props) $$invalidate(9, icon$1 = $$new_props.icon);
			if ('listItem' in $$new_props) $$invalidate(10, listItem = $$new_props.listItem);
			if ('pull' in $$new_props) $$invalidate(11, pull = $$new_props.pull);
			if ('pulse' in $$new_props) $$invalidate(12, pulse = $$new_props.pulse);
			if ('rotation' in $$new_props) $$invalidate(13, rotation = $$new_props.rotation);
			if ('size' in $$new_props) $$invalidate(14, size = $$new_props.size);
			if ('spin' in $$new_props) $$invalidate(15, spin = $$new_props.spin);
			if ('spinPulse' in $$new_props) $$invalidate(16, spinPulse = $$new_props.spinPulse);
			if ('spinReverse' in $$new_props) $$invalidate(17, spinReverse = $$new_props.spinReverse);
			if ('beat' in $$new_props) $$invalidate(18, beat = $$new_props.beat);
			if ('fade' in $$new_props) $$invalidate(19, fade = $$new_props.fade);
			if ('beatFade' in $$new_props) $$invalidate(20, beatFade = $$new_props.beatFade);
			if ('bounce' in $$new_props) $$invalidate(21, bounce = $$new_props.bounce);
			if ('shake' in $$new_props) $$invalidate(22, shake = $$new_props.shake);
			if ('symbol' in $$new_props) $$invalidate(23, symbol = $$new_props.symbol);
			if ('title' in $$new_props) $$invalidate(24, title = $$new_props.title);
			if ('titleId' in $$new_props) $$invalidate(25, titleId = $$new_props.titleId);
			if ('transform' in $$new_props) $$invalidate(26, transform = $$new_props.transform);
			if ('swapOpacity' in $$new_props) $$invalidate(27, swapOpacity = $$new_props.swapOpacity);
			if ('ref' in $$new_props) $$invalidate(0, ref = $$new_props.ref);
			if ('style' in $$new_props) $$invalidate(1, style = $$new_props.style);
		};

		$$self.$capture_state = () => ({
			classList,
			convert,
			coreIcon: icon,
			parse: parse$1,
			log,
			normalizeIconArgs,
			objectWithKey,
			SvgElement,
			border,
			mask,
			maskId,
			fixedWidth,
			inverse,
			flip,
			icon: icon$1,
			listItem,
			pull,
			pulse,
			rotation,
			size,
			spin,
			spinPulse,
			spinReverse,
			beat,
			fade,
			beatFade,
			bounce,
			shake,
			symbol,
			title,
			titleId,
			transform,
			swapOpacity,
			ref,
			style,
			iconLookup,
			classes,
			transformObj,
			maskObj,
			renderedIcon,
			result
		});

		$$self.$inject_state = $$new_props => {
			$$invalidate(35, $$props = assign(assign({}, $$props), $$new_props));
			if ('border' in $$props) $$invalidate(3, border = $$new_props.border);
			if ('mask' in $$props) $$invalidate(4, mask = $$new_props.mask);
			if ('maskId' in $$props) $$invalidate(5, maskId = $$new_props.maskId);
			if ('fixedWidth' in $$props) $$invalidate(6, fixedWidth = $$new_props.fixedWidth);
			if ('inverse' in $$props) $$invalidate(7, inverse = $$new_props.inverse);
			if ('flip' in $$props) $$invalidate(8, flip = $$new_props.flip);
			if ('icon' in $$props) $$invalidate(9, icon$1 = $$new_props.icon);
			if ('listItem' in $$props) $$invalidate(10, listItem = $$new_props.listItem);
			if ('pull' in $$props) $$invalidate(11, pull = $$new_props.pull);
			if ('pulse' in $$props) $$invalidate(12, pulse = $$new_props.pulse);
			if ('rotation' in $$props) $$invalidate(13, rotation = $$new_props.rotation);
			if ('size' in $$props) $$invalidate(14, size = $$new_props.size);
			if ('spin' in $$props) $$invalidate(15, spin = $$new_props.spin);
			if ('spinPulse' in $$props) $$invalidate(16, spinPulse = $$new_props.spinPulse);
			if ('spinReverse' in $$props) $$invalidate(17, spinReverse = $$new_props.spinReverse);
			if ('beat' in $$props) $$invalidate(18, beat = $$new_props.beat);
			if ('fade' in $$props) $$invalidate(19, fade = $$new_props.fade);
			if ('beatFade' in $$props) $$invalidate(20, beatFade = $$new_props.beatFade);
			if ('bounce' in $$props) $$invalidate(21, bounce = $$new_props.bounce);
			if ('shake' in $$props) $$invalidate(22, shake = $$new_props.shake);
			if ('symbol' in $$props) $$invalidate(23, symbol = $$new_props.symbol);
			if ('title' in $$props) $$invalidate(24, title = $$new_props.title);
			if ('titleId' in $$props) $$invalidate(25, titleId = $$new_props.titleId);
			if ('transform' in $$props) $$invalidate(26, transform = $$new_props.transform);
			if ('swapOpacity' in $$props) $$invalidate(27, swapOpacity = $$new_props.swapOpacity);
			if ('ref' in $$props) $$invalidate(0, ref = $$new_props.ref);
			if ('style' in $$props) $$invalidate(1, style = $$new_props.style);
			if ('result' in $$props) $$invalidate(2, result = $$new_props.result);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		$$props = exclude_internal_props($$props);

		return [
			ref,
			style,
			result,
			border,
			mask,
			maskId,
			fixedWidth,
			inverse,
			flip,
			icon$1,
			listItem,
			pull,
			pulse,
			rotation,
			size,
			spin,
			spinPulse,
			spinReverse,
			beat,
			fade,
			beatFade,
			bounce,
			shake,
			symbol,
			title,
			titleId,
			transform,
			swapOpacity,
			svgelement_ref_binding
		];
	}

	class FontAwesomeIcon extends SvelteComponentDev {
		constructor(options) {
			super(options);

			init(
				this,
				options,
				instance$t,
				create_fragment$t,
				safe_not_equal,
				{
					border: 3,
					mask: 4,
					maskId: 5,
					fixedWidth: 6,
					inverse: 7,
					flip: 8,
					icon: 9,
					listItem: 10,
					pull: 11,
					pulse: 12,
					rotation: 13,
					size: 14,
					spin: 15,
					spinPulse: 16,
					spinReverse: 17,
					beat: 18,
					fade: 19,
					beatFade: 20,
					bounce: 21,
					shake: 22,
					symbol: 23,
					title: 24,
					titleId: 25,
					transform: 26,
					swapOpacity: 27,
					ref: 0,
					style: 1
				},
				null,
				[-1, -1]
			);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "FontAwesomeIcon",
				options,
				id: create_fragment$t.name
			});
		}

		get border() {
			return this.$$.ctx[3];
		}

		set border(border) {
			this.$$set({ border });
			flush();
		}

		get mask() {
			return this.$$.ctx[4];
		}

		set mask(mask) {
			this.$$set({ mask });
			flush();
		}

		get maskId() {
			return this.$$.ctx[5];
		}

		set maskId(maskId) {
			this.$$set({ maskId });
			flush();
		}

		get fixedWidth() {
			return this.$$.ctx[6];
		}

		set fixedWidth(fixedWidth) {
			this.$$set({ fixedWidth });
			flush();
		}

		get inverse() {
			return this.$$.ctx[7];
		}

		set inverse(inverse) {
			this.$$set({ inverse });
			flush();
		}

		get flip() {
			return this.$$.ctx[8];
		}

		set flip(flip) {
			this.$$set({ flip });
			flush();
		}

		get icon() {
			return this.$$.ctx[9];
		}

		set icon(icon) {
			this.$$set({ icon });
			flush();
		}

		get listItem() {
			return this.$$.ctx[10];
		}

		set listItem(listItem) {
			this.$$set({ listItem });
			flush();
		}

		get pull() {
			return this.$$.ctx[11];
		}

		set pull(pull) {
			this.$$set({ pull });
			flush();
		}

		get pulse() {
			return this.$$.ctx[12];
		}

		set pulse(pulse) {
			this.$$set({ pulse });
			flush();
		}

		get rotation() {
			return this.$$.ctx[13];
		}

		set rotation(rotation) {
			this.$$set({ rotation });
			flush();
		}

		get size() {
			return this.$$.ctx[14];
		}

		set size(size) {
			this.$$set({ size });
			flush();
		}

		get spin() {
			return this.$$.ctx[15];
		}

		set spin(spin) {
			this.$$set({ spin });
			flush();
		}

		get spinPulse() {
			return this.$$.ctx[16];
		}

		set spinPulse(spinPulse) {
			this.$$set({ spinPulse });
			flush();
		}

		get spinReverse() {
			return this.$$.ctx[17];
		}

		set spinReverse(spinReverse) {
			this.$$set({ spinReverse });
			flush();
		}

		get beat() {
			return this.$$.ctx[18];
		}

		set beat(beat) {
			this.$$set({ beat });
			flush();
		}

		get fade() {
			return this.$$.ctx[19];
		}

		set fade(fade) {
			this.$$set({ fade });
			flush();
		}

		get beatFade() {
			return this.$$.ctx[20];
		}

		set beatFade(beatFade) {
			this.$$set({ beatFade });
			flush();
		}

		get bounce() {
			return this.$$.ctx[21];
		}

		set bounce(bounce) {
			this.$$set({ bounce });
			flush();
		}

		get shake() {
			return this.$$.ctx[22];
		}

		set shake(shake) {
			this.$$set({ shake });
			flush();
		}

		get symbol() {
			return this.$$.ctx[23];
		}

		set symbol(symbol) {
			this.$$set({ symbol });
			flush();
		}

		get title() {
			return this.$$.ctx[24];
		}

		set title(title) {
			this.$$set({ title });
			flush();
		}

		get titleId() {
			return this.$$.ctx[25];
		}

		set titleId(titleId) {
			this.$$set({ titleId });
			flush();
		}

		get transform() {
			return this.$$.ctx[26];
		}

		set transform(transform) {
			this.$$set({ transform });
			flush();
		}

		get swapOpacity() {
			return this.$$.ctx[27];
		}

		set swapOpacity(swapOpacity) {
			this.$$set({ swapOpacity });
			flush();
		}

		get ref() {
			return this.$$.ctx[0];
		}

		set ref(ref) {
			this.$$set({ ref });
			flush();
		}

		get style() {
			return this.$$.ctx[1];
		}

		set style(style) {
			this.$$set({ style });
			flush();
		}
	}

	create_custom_element(FontAwesomeIcon, {"border":{"type":"Boolean"},"mask":{},"maskId":{},"fixedWidth":{"type":"Boolean"},"inverse":{"type":"Boolean"},"flip":{"type":"Boolean"},"icon":{},"listItem":{"type":"Boolean"},"pull":{},"pulse":{"type":"Boolean"},"rotation":{},"size":{},"spin":{"type":"Boolean"},"spinPulse":{"type":"Boolean"},"spinReverse":{"type":"Boolean"},"beat":{"type":"Boolean"},"fade":{"type":"Boolean"},"beatFade":{"type":"Boolean"},"bounce":{"type":"Boolean"},"shake":{"type":"Boolean"},"symbol":{"type":"Boolean"},"title":{},"titleId":{},"transform":{},"swapOpacity":{"type":"Boolean"},"ref":{},"style":{}}, [], [], true);

	/* src/components/layout/CollapsibleContainer.svelte generated by Svelte v4.2.18 */
	const file$s = "src/components/layout/CollapsibleContainer.svelte";

	function add_css$q(target) {
		append_styles(target, "svelte-334um3", ".collapsible-container.svelte-334um3{border-radius:8px;padding:10px;margin-bottom:4px;background-color:var(--orchestra-cardBackground-4, transparent);border:1px solid var(--orchestra-borderColor, transparent);box-shadow:var(--orchestra-elevation3);display:flex;flex-direction:column;justify-content:flex-start;width:100%;box-sizing:border-box;max-height:100%;overflow:auto}.header.svelte-334um3{display:flex;justify-content:space-between;align-items:center;cursor:pointer;font-size:1.2rem;max-height:50px;color:var(--orchestra-textColor)}.title.svelte-334um3{font-size:1.2rem}.dev-mode.svelte-334um3{font-family:monospace !important;font-size:1rem !important}.collapsible-container-content.svelte-334um3{display:flex;flex-direction:column;justify-content:flex-start;width:100%;height:100%}.hidden.svelte-334um3{display:none}.hide-overflow.svelte-334um3{overflow:hidden}.full-height.svelte-334um3{height:100%}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ29sbGFwc2libGVDb250YWluZXIuc3ZlbHRlIiwibWFwcGluZ3MiOiJBQStCSSxvQ0FBdUIsQ0FDbkIsYUFBYSxDQUFFLEdBQUcsQ0FDbEIsT0FBTyxDQUFFLElBQUksQ0FDYixhQUFhLENBQUUsR0FBRyxDQUNsQixnQkFBZ0IsQ0FBRSxJQUFJLDRCQUE0QixDQUFDLFlBQVksQ0FBQyxDQUNoRSxNQUFNLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxDQUMzRCxVQUFVLENBQUUsSUFBSSxzQkFBc0IsQ0FBQyxDQUV2QyxPQUFPLENBQUUsSUFBSSxDQUNiLGNBQWMsQ0FBRSxNQUFNLENBQ3RCLGVBQWUsQ0FBRSxVQUFVLENBQzNCLEtBQUssQ0FBRSxJQUFJLENBQ1gsVUFBVSxDQUFFLFVBQVUsQ0FDdEIsVUFBVSxDQUFFLElBQUksQ0FDaEIsUUFBUSxDQUFFLElBQ2QsQ0FFQSxxQkFBUSxDQUNKLE9BQU8sQ0FBRSxJQUFJLENBQ2IsZUFBZSxDQUFFLGFBQWEsQ0FDOUIsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsTUFBTSxDQUFFLE9BQU8sQ0FDZixTQUFTLENBQUUsTUFBTSxDQUNqQixVQUFVLENBQUUsSUFBSSxDQUNoQixLQUFLLENBQUUsSUFBSSxxQkFBcUIsQ0FDcEMsQ0FFQSxvQkFBTyxDQUNILFNBQVMsQ0FBRSxNQUNmLENBRUEsdUJBQVUsQ0FDTixXQUFXLENBQUUsU0FBUyxDQUFDLFVBQVUsQ0FDakMsU0FBUyxDQUFFLElBQUksQ0FBQyxVQUNwQixDQUVBLDRDQUErQixDQUMzQixPQUFPLENBQUUsSUFBSSxDQUNiLGNBQWMsQ0FBRSxNQUFNLENBQ3RCLGVBQWUsQ0FBRSxVQUFVLENBQzNCLEtBQUssQ0FBRSxJQUFJLENBQ1gsTUFBTSxDQUFFLElBQ1osQ0FFQSxxQkFBUSxDQUNKLE9BQU8sQ0FBRSxJQUNiLENBRUEsNEJBQWUsQ0FDWCxRQUFRLENBQUUsTUFDZCxDQUVBLDBCQUFhLENBQ1QsTUFBTSxDQUFFLElBQ1oiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiQ29sbGFwc2libGVDb250YWluZXIuc3ZlbHRlIl19 */");
	}

	// (96:8) {:else}
	function create_else_block$b(ctx) {
		let fontawesomeicon;
		let current;

		fontawesomeicon = new FontAwesomeIcon({
				props: { icon: faChevronUp },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(fontawesomeicon.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(fontawesomeicon, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(fontawesomeicon.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(fontawesomeicon.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(fontawesomeicon, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block$b.name,
			type: "else",
			source: "(96:8) {:else}",
			ctx
		});

		return block;
	}

	// (94:8) {#if $isCollapsed}
	function create_if_block$c(ctx) {
		let fontawesomeicon;
		let current;

		fontawesomeicon = new FontAwesomeIcon({
				props: { icon: faChevronDown },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(fontawesomeicon.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(fontawesomeicon, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(fontawesomeicon.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(fontawesomeicon.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(fontawesomeicon, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$c.name,
			type: "if",
			source: "(94:8) {#if $isCollapsed}",
			ctx
		});

		return block;
	}

	function create_fragment$s(ctx) {
		let div2;
		let div0;
		let h2;
		let t0;
		let h2_class_value;
		let t1;
		let current_block_type_index;
		let if_block;
		let div0_class_value;
		let div0_style_value;
		let t2;
		let div1;
		let div2_class_value;
		let current;
		let mounted;
		let dispose;
		const if_block_creators = [create_if_block$c, create_else_block$b];
		const if_blocks = [];

		function select_block_type(ctx, dirty) {
			if (/*$isCollapsed*/ ctx[9]) return 0;
			return 1;
		}

		current_block_type_index = select_block_type(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
		const default_slot_template = /*#slots*/ ctx[15].default;
		const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[14], null);

		const block = {
			c: function create() {
				div2 = element("div");
				div0 = element("div");
				h2 = element("h2");
				t0 = text(/*title*/ ctx[0]);
				t1 = space();
				if_block.c();
				t2 = space();
				div1 = element("div");
				if (default_slot) default_slot.c();
				attr_dev(h2, "class", h2_class_value = "" + (null_to_empty(/*titleBaseClass*/ ctx[6]) + " svelte-334um3"));
				add_location(h2, file$s, 92, 8, 2524);
				attr_dev(div0, "class", div0_class_value = "" + (null_to_empty(/*headerBaseClass*/ ctx[7]) + " svelte-334um3"));
				attr_dev(div0, "style", div0_style_value = `${/*headerStyle*/ ctx[1]}`);
				add_location(div0, file$s, 91, 4, 2435);
				attr_dev(div1, "class", "collapsible-container-content svelte-334um3");
				toggle_class(div1, "hidden", /*$isCollapsed*/ ctx[9]);
				toggle_class(div1, "hide-overflow", /*hideOverflow*/ ctx[4]);
				add_location(div1, file$s, 99, 4, 2740);
				attr_dev(div2, "class", div2_class_value = "" + (null_to_empty(`${/*containerBaseClass*/ ctx[8]} ${/*containerClass*/ ctx[3]}`) + " svelte-334um3"));
				attr_dev(div2, "style", /*containerStyle*/ ctx[2]);
				toggle_class(div2, "full-height", /*fullHeight*/ ctx[5]);
				add_location(div2, file$s, 90, 0, 2321);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div2, anchor);
				append_dev(div2, div0);
				append_dev(div0, h2);
				append_dev(h2, t0);
				append_dev(div0, t1);
				if_blocks[current_block_type_index].m(div0, null);
				append_dev(div2, t2);
				append_dev(div2, div1);

				if (default_slot) {
					default_slot.m(div1, null);
				}

				current = true;

				if (!mounted) {
					dispose = listen_dev(div0, "click", /*toggleCollapse*/ ctx[11], false, false, false, false);
					mounted = true;
				}
			},
			p: function update(ctx, [dirty]) {
				if (!current || dirty & /*title*/ 1) set_data_dev(t0, /*title*/ ctx[0]);

				if (!current || dirty & /*titleBaseClass*/ 64 && h2_class_value !== (h2_class_value = "" + (null_to_empty(/*titleBaseClass*/ ctx[6]) + " svelte-334um3"))) {
					attr_dev(h2, "class", h2_class_value);
				}

				let previous_block_index = current_block_type_index;
				current_block_type_index = select_block_type(ctx);

				if (current_block_type_index !== previous_block_index) {
					group_outros();

					transition_out(if_blocks[previous_block_index], 1, 1, () => {
						if_blocks[previous_block_index] = null;
					});

					check_outros();
					if_block = if_blocks[current_block_type_index];

					if (!if_block) {
						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
						if_block.c();
					}

					transition_in(if_block, 1);
					if_block.m(div0, null);
				}

				if (!current || dirty & /*headerBaseClass*/ 128 && div0_class_value !== (div0_class_value = "" + (null_to_empty(/*headerBaseClass*/ ctx[7]) + " svelte-334um3"))) {
					attr_dev(div0, "class", div0_class_value);
				}

				if (!current || dirty & /*headerStyle*/ 2 && div0_style_value !== (div0_style_value = `${/*headerStyle*/ ctx[1]}`)) {
					attr_dev(div0, "style", div0_style_value);
				}

				if (default_slot) {
					if (default_slot.p && (!current || dirty & /*$$scope*/ 16384)) {
						update_slot_base(
							default_slot,
							default_slot_template,
							ctx,
							/*$$scope*/ ctx[14],
							!current
							? get_all_dirty_from_scope(/*$$scope*/ ctx[14])
							: get_slot_changes(default_slot_template, /*$$scope*/ ctx[14], dirty, null),
							null
						);
					}
				}

				if (!current || dirty & /*$isCollapsed*/ 512) {
					toggle_class(div1, "hidden", /*$isCollapsed*/ ctx[9]);
				}

				if (!current || dirty & /*hideOverflow*/ 16) {
					toggle_class(div1, "hide-overflow", /*hideOverflow*/ ctx[4]);
				}

				if (!current || dirty & /*containerBaseClass, containerClass*/ 264 && div2_class_value !== (div2_class_value = "" + (null_to_empty(`${/*containerBaseClass*/ ctx[8]} ${/*containerClass*/ ctx[3]}`) + " svelte-334um3"))) {
					attr_dev(div2, "class", div2_class_value);
				}

				if (!current || dirty & /*containerStyle*/ 4) {
					attr_dev(div2, "style", /*containerStyle*/ ctx[2]);
				}

				if (!current || dirty & /*containerBaseClass, containerClass, fullHeight*/ 296) {
					toggle_class(div2, "full-height", /*fullHeight*/ ctx[5]);
				}
			},
			i: function intro(local) {
				if (current) return;
				transition_in(if_block);
				transition_in(default_slot, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block);
				transition_out(default_slot, local);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div2);
				}

				if_blocks[current_block_type_index].d();
				if (default_slot) default_slot.d(detaching);
				mounted = false;
				dispose();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$s.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$s($$self, $$props, $$invalidate) {
		let containerBaseClass;
		let headerBaseClass;
		let titleBaseClass;
		let $isCollapsed;
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('CollapsibleContainer', slots, ['default']);
		let { title = '' } = $$props;
		let { headerStyle = '' } = $$props;
		let { containerStyle = '' } = $$props;
		let { containerClass = '' } = $$props;
		let { initCollapsed = false } = $$props;
		let { mode = '' } = $$props;
		let { hideOverflow = false } = $$props;
		let { fullHeight = false } = $$props;
		const dispatch = createEventDispatcher();
		let isCollapsed = writable(initCollapsed);
		validate_store(isCollapsed, 'isCollapsed');
		component_subscribe($$self, isCollapsed, value => $$invalidate(9, $isCollapsed = value));

		function toggleCollapse() {
			isCollapsed.update(value => !value);
			dispatch('toggle', { collapsed: !$isCollapsed });
		}

		const writable_props = [
			'title',
			'headerStyle',
			'containerStyle',
			'containerClass',
			'initCollapsed',
			'mode',
			'hideOverflow',
			'fullHeight'
		];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<CollapsibleContainer> was created with unknown prop '${key}'`);
		});

		$$self.$$set = $$props => {
			if ('title' in $$props) $$invalidate(0, title = $$props.title);
			if ('headerStyle' in $$props) $$invalidate(1, headerStyle = $$props.headerStyle);
			if ('containerStyle' in $$props) $$invalidate(2, containerStyle = $$props.containerStyle);
			if ('containerClass' in $$props) $$invalidate(3, containerClass = $$props.containerClass);
			if ('initCollapsed' in $$props) $$invalidate(12, initCollapsed = $$props.initCollapsed);
			if ('mode' in $$props) $$invalidate(13, mode = $$props.mode);
			if ('hideOverflow' in $$props) $$invalidate(4, hideOverflow = $$props.hideOverflow);
			if ('fullHeight' in $$props) $$invalidate(5, fullHeight = $$props.fullHeight);
			if ('$$scope' in $$props) $$invalidate(14, $$scope = $$props.$$scope);
		};

		$$self.$capture_state = () => ({
			createEventDispatcher,
			writable,
			faChevronDown,
			faChevronUp,
			FontAwesomeIcon,
			title,
			headerStyle,
			containerStyle,
			containerClass,
			initCollapsed,
			mode,
			hideOverflow,
			fullHeight,
			dispatch,
			isCollapsed,
			toggleCollapse,
			titleBaseClass,
			headerBaseClass,
			containerBaseClass,
			$isCollapsed
		});

		$$self.$inject_state = $$props => {
			if ('title' in $$props) $$invalidate(0, title = $$props.title);
			if ('headerStyle' in $$props) $$invalidate(1, headerStyle = $$props.headerStyle);
			if ('containerStyle' in $$props) $$invalidate(2, containerStyle = $$props.containerStyle);
			if ('containerClass' in $$props) $$invalidate(3, containerClass = $$props.containerClass);
			if ('initCollapsed' in $$props) $$invalidate(12, initCollapsed = $$props.initCollapsed);
			if ('mode' in $$props) $$invalidate(13, mode = $$props.mode);
			if ('hideOverflow' in $$props) $$invalidate(4, hideOverflow = $$props.hideOverflow);
			if ('fullHeight' in $$props) $$invalidate(5, fullHeight = $$props.fullHeight);
			if ('isCollapsed' in $$props) $$invalidate(10, isCollapsed = $$props.isCollapsed);
			if ('titleBaseClass' in $$props) $$invalidate(6, titleBaseClass = $$props.titleBaseClass);
			if ('headerBaseClass' in $$props) $$invalidate(7, headerBaseClass = $$props.headerBaseClass);
			if ('containerBaseClass' in $$props) $$invalidate(8, containerBaseClass = $$props.containerBaseClass);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		$$self.$$.update = () => {
			if ($$self.$$.dirty & /*mode*/ 8192) {
				$$invalidate(6, titleBaseClass = mode === 'dev' ? 'title dev-mode' : 'title');
			}
		};

		$$invalidate(8, containerBaseClass = 'collapsible-container');
		$$invalidate(7, headerBaseClass = 'header');

		return [
			title,
			headerStyle,
			containerStyle,
			containerClass,
			hideOverflow,
			fullHeight,
			titleBaseClass,
			headerBaseClass,
			containerBaseClass,
			$isCollapsed,
			isCollapsed,
			toggleCollapse,
			initCollapsed,
			mode,
			$$scope,
			slots
		];
	}

	class CollapsibleContainer extends SvelteComponentDev {
		constructor(options) {
			super(options);

			init(
				this,
				options,
				instance$s,
				create_fragment$s,
				safe_not_equal,
				{
					title: 0,
					headerStyle: 1,
					containerStyle: 2,
					containerClass: 3,
					initCollapsed: 12,
					mode: 13,
					hideOverflow: 4,
					fullHeight: 5
				},
				add_css$q
			);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "CollapsibleContainer",
				options,
				id: create_fragment$s.name
			});
		}

		get title() {
			return this.$$.ctx[0];
		}

		set title(title) {
			this.$$set({ title });
			flush();
		}

		get headerStyle() {
			return this.$$.ctx[1];
		}

		set headerStyle(headerStyle) {
			this.$$set({ headerStyle });
			flush();
		}

		get containerStyle() {
			return this.$$.ctx[2];
		}

		set containerStyle(containerStyle) {
			this.$$set({ containerStyle });
			flush();
		}

		get containerClass() {
			return this.$$.ctx[3];
		}

		set containerClass(containerClass) {
			this.$$set({ containerClass });
			flush();
		}

		get initCollapsed() {
			return this.$$.ctx[12];
		}

		set initCollapsed(initCollapsed) {
			this.$$set({ initCollapsed });
			flush();
		}

		get mode() {
			return this.$$.ctx[13];
		}

		set mode(mode) {
			this.$$set({ mode });
			flush();
		}

		get hideOverflow() {
			return this.$$.ctx[4];
		}

		set hideOverflow(hideOverflow) {
			this.$$set({ hideOverflow });
			flush();
		}

		get fullHeight() {
			return this.$$.ctx[5];
		}

		set fullHeight(fullHeight) {
			this.$$set({ fullHeight });
			flush();
		}
	}

	create_custom_element(CollapsibleContainer, {"title":{},"headerStyle":{},"containerStyle":{},"containerClass":{},"initCollapsed":{"type":"Boolean"},"mode":{},"hideOverflow":{"type":"Boolean"},"fullHeight":{"type":"Boolean"}}, ["default"], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/PreviewHeader.svelte generated by Svelte v4.2.18 */
	const file$r = "src/orchestraUi/DevTools/SiteDesignPreview/PreviewHeader.svelte";

	function add_css$p(target) {
		append_styles(target, "svelte-1copmkp", ".ux-preview-controls.svelte-1copmkp,.screen-size-controls.svelte-1copmkp{width:100%;display:flex;justify-content:space-between;align-items:center;margin:10px;padding:10px;gap:20px}.screen-size-controls.svelte-1copmkp{justify-content:flex-end}.is-selected.svelte-1copmkp{background-color:var(--orchestra-accent1-4)}.left-controls.svelte-1copmkp{display:flex;gap:20px}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHJldmlld0hlYWRlci5zdmVsdGUiLCJtYXBwaW5ncyI6IkFBT0ksbUNBQW9CLENBQUUsb0NBQXNCLENBQ3hDLEtBQUssQ0FBRSxJQUFJLENBQ1gsT0FBTyxDQUFFLElBQUksQ0FDYixlQUFlLENBQUUsYUFBYSxDQUM5QixXQUFXLENBQUUsTUFBTSxDQUNuQixNQUFNLENBQUUsSUFBSSxDQUNaLE9BQU8sQ0FBRSxJQUFJLENBQ2IsR0FBRyxDQUFFLElBQ1QsQ0FFQSxvQ0FBc0IsQ0FDbEIsZUFBZSxDQUFFLFFBRXJCLENBRUEsMkJBQWEsQ0FDVCxnQkFBZ0IsQ0FBRSxJQUFJLHFCQUFxQixDQUMvQyxDQUVBLDZCQUFlLENBQ1gsT0FBTyxDQUFFLElBQUksQ0FDYixHQUFHLENBQUUsSUFDVCIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJQcmV2aWV3SGVhZGVyLnN2ZWx0ZSJdfQ== */");
	}

	function create_fragment$r(ctx) {
		let div5;
		let div0;
		let t0;
		let div4;
		let div1;
		let button0;
		let fontawesomeicon0;
		let div1_class_value;
		let t1;
		let div2;
		let button1;
		let fontawesomeicon1;
		let div2_class_value;
		let t2;
		let div3;
		let button2;
		let fontawesomeicon2;
		let div3_class_value;
		let current;
		let mounted;
		let dispose;

		fontawesomeicon0 = new FontAwesomeIcon({
				props: { icon: faDesktop },
				$$inline: true
			});

		fontawesomeicon1 = new FontAwesomeIcon({
				props: { icon: faTablet },
				$$inline: true
			});

		fontawesomeicon2 = new FontAwesomeIcon({ props: { icon: faPhone }, $$inline: true });

		const block = {
			c: function create() {
				div5 = element("div");
				div0 = element("div");
				t0 = space();
				div4 = element("div");
				div1 = element("div");
				button0 = element("button");
				create_component(fontawesomeicon0.$$.fragment);
				t1 = space();
				div2 = element("div");
				button1 = element("button");
				create_component(fontawesomeicon1.$$.fragment);
				t2 = space();
				div3 = element("div");
				button2 = element("button");
				create_component(fontawesomeicon2.$$.fragment);
				attr_dev(div0, "class", "left-controls svelte-1copmkp");
				add_location(div0, file$r, 33, 4, 752);
				add_location(button0, file$r, 36, 12, 931);

				attr_dev(div1, "class", div1_class_value = "button-wrapper " + (/*$selectedDevice*/ ctx[0] === 'full-screen'
				? 'is-selected'
				: '') + " svelte-1copmkp");

				add_location(div1, file$r, 35, 8, 833);
				add_location(button1, file$r, 39, 12, 1151);

				attr_dev(div2, "class", div2_class_value = "button-wrapper " + (/*$selectedDevice*/ ctx[0] === 'tablet'
				? 'is-selected'
				: '') + " svelte-1copmkp");

				add_location(div2, file$r, 38, 8, 1058);
				add_location(button2, file$r, 42, 12, 1364);

				attr_dev(div3, "class", div3_class_value = "button-wrapper " + (/*$selectedDevice*/ ctx[0] === 'phone'
				? 'is-selected'
				: '') + " svelte-1copmkp");

				add_location(div3, file$r, 41, 8, 1272);
				attr_dev(div4, "class", "screen-size-controls svelte-1copmkp");
				add_location(div4, file$r, 34, 4, 790);
				attr_dev(div5, "class", "ux-preview-controls svelte-1copmkp");
				add_location(div5, file$r, 32, 0, 714);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div5, anchor);
				append_dev(div5, div0);
				append_dev(div5, t0);
				append_dev(div5, div4);
				append_dev(div4, div1);
				append_dev(div1, button0);
				mount_component(fontawesomeicon0, button0, null);
				append_dev(div4, t1);
				append_dev(div4, div2);
				append_dev(div2, button1);
				mount_component(fontawesomeicon1, button1, null);
				append_dev(div4, t2);
				append_dev(div4, div3);
				append_dev(div3, button2);
				mount_component(fontawesomeicon2, button2, null);
				current = true;

				if (!mounted) {
					dispose = [
						listen_dev(button0, "click", /*click_handler*/ ctx[1], false, false, false, false),
						listen_dev(button1, "click", /*click_handler_1*/ ctx[2], false, false, false, false),
						listen_dev(button2, "click", /*click_handler_2*/ ctx[3], false, false, false, false)
					];

					mounted = true;
				}
			},
			p: function update(ctx, [dirty]) {
				if (!current || dirty & /*$selectedDevice*/ 1 && div1_class_value !== (div1_class_value = "button-wrapper " + (/*$selectedDevice*/ ctx[0] === 'full-screen'
				? 'is-selected'
				: '') + " svelte-1copmkp")) {
					attr_dev(div1, "class", div1_class_value);
				}

				if (!current || dirty & /*$selectedDevice*/ 1 && div2_class_value !== (div2_class_value = "button-wrapper " + (/*$selectedDevice*/ ctx[0] === 'tablet'
				? 'is-selected'
				: '') + " svelte-1copmkp")) {
					attr_dev(div2, "class", div2_class_value);
				}

				if (!current || dirty & /*$selectedDevice*/ 1 && div3_class_value !== (div3_class_value = "button-wrapper " + (/*$selectedDevice*/ ctx[0] === 'phone'
				? 'is-selected'
				: '') + " svelte-1copmkp")) {
					attr_dev(div3, "class", div3_class_value);
				}
			},
			i: function intro(local) {
				if (current) return;
				transition_in(fontawesomeicon0.$$.fragment, local);
				transition_in(fontawesomeicon1.$$.fragment, local);
				transition_in(fontawesomeicon2.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(fontawesomeicon0.$$.fragment, local);
				transition_out(fontawesomeicon1.$$.fragment, local);
				transition_out(fontawesomeicon2.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div5);
				}

				destroy_component(fontawesomeicon0);
				destroy_component(fontawesomeicon1);
				destroy_component(fontawesomeicon2);
				mounted = false;
				run_all(dispose);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$r.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$r($$self, $$props, $$invalidate) {
		let $selectedDevice;
		validate_store(selectedDevice, 'selectedDevice');
		component_subscribe($$self, selectedDevice, $$value => $$invalidate(0, $selectedDevice = $$value));
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('PreviewHeader', slots, []);
		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<PreviewHeader> was created with unknown prop '${key}'`);
		});

		const click_handler = () => setSelectedDevice('full-screen');
		const click_handler_1 = () => setSelectedDevice('tablet');
		const click_handler_2 = () => setSelectedDevice('phone');

		$$self.$capture_state = () => ({
			faDesktop,
			faPhone,
			faTablet,
			FontAwesomeIcon,
			selectedDevice,
			setSelectedDevice,
			$selectedDevice
		});

		return [$selectedDevice, click_handler, click_handler_1, click_handler_2];
	}

	class PreviewHeader extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$r, create_fragment$r, safe_not_equal, {}, add_css$p);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "PreviewHeader",
				options,
				id: create_fragment$r.name
			});
		}
	}

	create_custom_element(PreviewHeader, {}, [], [], true);

	/*
	Adapted from https://github.com/mattdesl
	Distributed under MIT License https://github.com/mattdesl/eases/blob/master/LICENSE.md
	*/

	/**
	 * https://svelte.dev/docs/svelte-easing
	 * @param {number} t
	 * @returns {number}
	 */
	function cubicOut(t) {
		const f = t - 1.0;
		return f * f * f + 1.0;
	}

	/**
	 * Animates the opacity of an element from 0 to the current opacity for `in` transitions and from the current opacity to 0 for `out` transitions.
	 *
	 * https://svelte.dev/docs/svelte-transition#fade
	 * @param {Element} node
	 * @param {import('./public').FadeParams} [params]
	 * @returns {import('./public').TransitionConfig}
	 */
	function fade(node, { delay = 0, duration = 400, easing = identity } = {}) {
		const o = +getComputedStyle(node).opacity;
		return {
			delay,
			duration,
			easing,
			css: (t) => `opacity: ${t * o}`
		};
	}

	/**
	 * Animates the x and y positions and the opacity of an element. `in` transitions animate from the provided values, passed as parameters to the element's default values. `out` transitions animate from the element's default values to the provided values.
	 *
	 * https://svelte.dev/docs/svelte-transition#fly
	 * @param {Element} node
	 * @param {import('./public').FlyParams} [params]
	 * @returns {import('./public').TransitionConfig}
	 */
	function fly(
		node,
		{ delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 } = {}
	) {
		const style = getComputedStyle(node);
		const target_opacity = +style.opacity;
		const transform = style.transform === 'none' ? '' : style.transform;
		const od = target_opacity * (1 - opacity);
		const [xValue, xUnit] = split_css_unit(x);
		const [yValue, yUnit] = split_css_unit(y);
		return {
			delay,
			duration,
			easing,
			css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * xValue}${xUnit}, ${(1 - t) * yValue}${yUnit});
			opacity: ${target_opacity - od * u}`
		};
	}

	/**
	 * The flip function calculates the start and end position of an element and animates between them, translating the x and y values.
	 * `flip` stands for [First, Last, Invert, Play](https://aerotwist.com/blog/flip-your-animations/).
	 *
	 * https://svelte.dev/docs/svelte-animate#flip
	 * @param {Element} node
	 * @param {{ from: DOMRect; to: DOMRect }} fromTo
	 * @param {import('./public.js').FlipParams} params
	 * @returns {import('./public.js').AnimationConfig}
	 */
	function flip(node, { from, to }, params = {}) {
		const style = getComputedStyle(node);
		const transform = style.transform === 'none' ? '' : style.transform;
		const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat);
		const dx = from.left + (from.width * ox) / to.width - (to.left + ox);
		const dy = from.top + (from.height * oy) / to.height - (to.top + oy);
		const { delay = 0, duration = (d) => Math.sqrt(d) * 120, easing = cubicOut } = params;
		return {
			delay,
			duration: is_function(duration) ? duration(Math.sqrt(dx * dx + dy * dy)) : duration,
			easing,
			css: (t, u) => {
				const x = u * dx;
				const y = u * dy;
				const sx = t + (u * from.width) / to.width;
				const sy = t + (u * from.height) / to.height;
				return `transform: ${transform} translate(${x}px, ${y}px) scale(${sx}, ${sy});`;
			}
		};
	}

	/**
	 * @typedef {import('svelte').ComponentType} SvelteComponent
	 */

	/**
	 * @typedef {import('svelte/transition').FlyParams} FlyParams
	 */

	/**
	 * @typedef {Object} SvelteToastCustomComponent
	 * @property {SvelteComponent} src - custom Svelte Component
	 * @property {Object<string,any>} [props] - props to pass into custom component
	 * @property {string} [sendIdTo] - forward toast id to prop name
	 */

	/**
	 * @callback SvelteToastOnPopCallback
	 * @param {number} [id] - optionally get the toast id if needed
	 */

	/**
	 * @typedef {Object} SvelteToastOptions
	 * @property {number} [id] - unique id generated for every toast
	 * @property {string} [target] - container target name to send toast to
	 * @property {string} [msg] - toast message
	 * @property {number} [duration] - duration of progress bar tween from initial to next
	 * @property {number} [initial] - initial progress bar value
	 * @property {number} [next] - next progress bar value
	 * @property {boolean} [pausable] - pause progress bar tween on mouse hover
	 * @property {boolean} [dismissable] - allow dissmiss with close button
	 * @property {boolean} [reversed] - display toasts in reverse order
	 * @property {FlyParams} [intro] - toast intro fly animation settings
	 * @property {Object<string,string|number>} [theme] - css var overrides
	 * @property {string[]} [classes] - user-defined classes
	 * @property {SvelteToastOnPopCallback} [onpop] - callback that runs on toast dismiss
	 * @property {SvelteToastCustomComponent} [component] - send custom Svelte Component as a message
	 * @property {number} [progress] - DEPRECATED
	 */

	/** @type {SvelteToastOptions} */
	const defaults = {
	  duration: 4000,
	  initial: 1,
	  next: 0,
	  pausable: false,
	  dismissable: true,
	  reversed: false,
	  intro: { x: 256 }
	};

	function createToast() {
	  const { subscribe, update } = writable(new Array());
	  /** @type {Object<string,SvelteToastOptions>} */
	  const options = {};
	  let count = 0;

	  /** @param {any} obj */
	  function _obj(obj) {
	    return obj instanceof Object
	  }

	  function _init(target = 'default', opts = {}) {
	    options[target] = opts;
	    return options
	  }

	  /**
	   * Send a new toast
	   * @param {(string|SvelteToastOptions)} msg
	   * @param {SvelteToastOptions} [opts]
	   * @returns {number}
	   */
	  function push(msg, opts) {
	    const param = {
	      target: 'default',
	      ...(_obj(msg) ? /** @type {SvelteToastOptions} */ (msg) : { ...opts, msg })
	    };
	    const conf = options[param.target] || {};
	    const entry = {
	      ...defaults,
	      ...conf,
	      ...param,
	      theme: { ...conf.theme, ...param.theme },
	      classes: [...(conf.classes || []), ...(param.classes || [])],
	      id: ++count
	    };
	    update((n) => (entry.reversed ? [...n, entry] : [entry, ...n]));
	    return count
	  }

	  /**
	   * Remove toast(s)
	   * - toast.pop() // removes the last toast
	   * - toast.pop(0) // remove all toasts
	   * - toast.pop(id) // removes the toast with specified `id`
	   * - toast.pop({ target: 'foo' }) // remove all toasts from target `foo`
	   * @param {(number|Object<'target',string>)} [id]
	   */
	  function pop(id) {
	    update((n) => {
	      if (!n.length || id === 0) return []
	      // Filter function is deprecated; shim added for backward compatibility
	      if (typeof id === 'function') return n.filter((i) => id(i))
	      if (_obj(id))
	        return n.filter(/** @type {SvelteToastOptions[]} i */ (i) => i.target !== id.target)
	      const found = id || Math.max(...n.map((i) => i.id));
	      return n.filter((i) => i.id !== found)
	    });
	  }

	  /**
	   * Update an existing toast
	   * @param {(number|SvelteToastOptions)} id
	   * @param {SvelteToastOptions} [opts]
	   */
	  function set(id, opts) {
	    /** @type {any} */
	    const param = _obj(id) ? id : { ...opts, id };
	    update((n) => {
	      const idx = n.findIndex((i) => i.id === param.id);
	      if (idx > -1) {
	        n[idx] = { ...n[idx], ...param };
	      }
	      return n
	    });
	  }

	  return { subscribe, push, pop, set, _init }
	}

	const toast = createToast();

	/**
	 * @param {any} obj
	 * @returns {boolean}
	 */
	function is_date(obj) {
		return Object.prototype.toString.call(obj) === '[object Date]';
	}

	/** @returns {(t: any) => any} */
	function get_interpolator(a, b) {
		if (a === b || a !== a) return () => a;
		const type = typeof a;
		if (type !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
			throw new Error('Cannot interpolate values of different type');
		}
		if (Array.isArray(a)) {
			const arr = b.map((bi, i) => {
				return get_interpolator(a[i], bi);
			});
			return (t) => arr.map((fn) => fn(t));
		}
		if (type === 'object') {
			if (!a || !b) throw new Error('Object cannot be null');
			if (is_date(a) && is_date(b)) {
				a = a.getTime();
				b = b.getTime();
				const delta = b - a;
				return (t) => new Date(a + t * delta);
			}
			const keys = Object.keys(b);
			const interpolators = {};
			keys.forEach((key) => {
				interpolators[key] = get_interpolator(a[key], b[key]);
			});
			return (t) => {
				const result = {};
				keys.forEach((key) => {
					result[key] = interpolators[key](t);
				});
				return result;
			};
		}
		if (type === 'number') {
			const delta = b - a;
			return (t) => a + t * delta;
		}
		throw new Error(`Cannot interpolate ${type} values`);
	}

	/**
	 * A tweened store in Svelte is a special type of store that provides smooth transitions between state values over time.
	 *
	 * https://svelte.dev/docs/svelte-motion#tweened
	 * @template T
	 * @param {T} [value]
	 * @param {import('./private.js').TweenedOptions<T>} [defaults]
	 * @returns {import('./public.js').Tweened<T>}
	 */
	function tweened(value, defaults = {}) {
		const store = writable(value);
		/** @type {import('../internal/private.js').Task} */
		let task;
		let target_value = value;
		/**
		 * @param {T} new_value
		 * @param {import('./private.js').TweenedOptions<T>} [opts]
		 */
		function set(new_value, opts) {
			if (value == null) {
				store.set((value = new_value));
				return Promise.resolve();
			}
			target_value = new_value;
			let previous_task = task;
			let started = false;
			let {
				delay = 0,
				duration = 400,
				easing = identity,
				interpolate = get_interpolator
			} = assign(assign({}, defaults), opts);
			if (duration === 0) {
				if (previous_task) {
					previous_task.abort();
					previous_task = null;
				}
				store.set((value = target_value));
				return Promise.resolve();
			}
			const start = now() + delay;
			let fn;
			task = loop((now) => {
				if (now < start) return true;
				if (!started) {
					fn = interpolate(value, new_value);
					if (typeof duration === 'function') duration = duration(value, new_value);
					started = true;
				}
				if (previous_task) {
					previous_task.abort();
					previous_task = null;
				}
				const elapsed = now - start;
				if (elapsed > /** @type {number} */ (duration)) {
					store.set((value = new_value));
					return false;
				}
				// @ts-ignore
				store.set((value = fn(easing(elapsed / duration))));
				return true;
			});
			return task.promise;
		}
		return {
			set,
			update: (fn, opts) => set(fn(target_value, value), opts),
			subscribe: store.subscribe
		};
	}

	/* node_modules/@zerodevx/svelte-toast/ToastItem.svelte generated by Svelte v4.2.18 */
	const file$q = "node_modules/@zerodevx/svelte-toast/ToastItem.svelte";

	function add_css$o(target) {
		append_styles(target, "svelte-95rq8t", "._toastItem.svelte-95rq8t{width:var(--toastWidth, 16rem);height:var(--toastHeight, auto);min-height:var(--toastMinHeight, 3.5rem);margin:var(--toastMargin, 0 0 0.5rem 0);padding:var(--toastPadding, 0);background:var(--toastBackground, rgba(66, 66, 66, 0.9));color:var(--toastColor, #fff);box-shadow:var(\n    --toastBoxShadow,\n    0 4px 6px -1px rgba(0, 0, 0, 0.1),\n    0 2px 4px -1px rgba(0, 0, 0, 0.06)\n  );border:var(--toastBorder, none);border-radius:var(--toastBorderRadius, 0.125rem);position:relative;display:flex;flex-direction:row;align-items:center;overflow:hidden;will-change:transform, opacity;-webkit-tap-highlight-color:transparent}._toastMsg.svelte-95rq8t{padding:var(--toastMsgPadding, 0.75rem 0.5rem);flex:1 1 0%}.pe.svelte-95rq8t,._toastMsg.svelte-95rq8t a{pointer-events:auto}._toastBtn.svelte-95rq8t{width:var(--toastBtnWidth, 2rem);height:var(--toastBtnHeight, 100%);cursor:pointer;outline:none}._toastBtn.svelte-95rq8t::after{content:var(--toastBtnContent, '✕');font:var(--toastBtnFont, 1rem sans-serif);display:flex;align-items:center;justify-content:center}._toastBar.svelte-95rq8t{top:var(--toastBarTop, auto);right:var(--toastBarRight, auto);bottom:var(--toastBarBottom, 0);left:var(--toastBarLeft, 0);height:var(--toastBarHeight, 6px);width:var(--toastBarWidth, 100%);position:absolute;display:block;-webkit-appearance:none;-moz-appearance:none;appearance:none;border:none;background:transparent;pointer-events:none}._toastBar.svelte-95rq8t::-webkit-progress-bar{background:transparent}._toastBar.svelte-95rq8t::-webkit-progress-value{background:var(--toastProgressBackground, var(--toastBarBackground, rgba(33, 150, 243, 0.75)))}._toastBar.svelte-95rq8t::-moz-progress-bar{background:var(--toastProgressBackground, var(--toastBarBackground, rgba(33, 150, 243, 0.75)))}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVG9hc3RJdGVtLnN2ZWx0ZSIsIm1hcHBpbmdzIjoiQUFvSEEseUJBQVksQ0FDVixLQUFLLENBQUUsSUFBSSxZQUFZLENBQUMsTUFBTSxDQUFDLENBQy9CLE1BQU0sQ0FBRSxJQUFJLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FDaEMsVUFBVSxDQUFFLElBQUksZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQ3pDLE1BQU0sQ0FBRSxJQUFJLGFBQWEsQ0FBQyxhQUFhLENBQUMsQ0FDeEMsT0FBTyxDQUFFLElBQUksY0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUMvQixVQUFVLENBQUUsSUFBSSxpQkFBaUIsQ0FBQyxzQkFBc0IsQ0FBQyxDQUN6RCxLQUFLLENBQUUsSUFBSSxZQUFZLENBQUMsS0FBSyxDQUFDLENBQzlCLFVBQVUsQ0FBRTtBQUNkLElBQUksZ0JBQWdCO0FBQ3BCO0FBQ0E7QUFDQSxFQUFFLENBQUMsQ0FDRCxNQUFNLENBQUUsSUFBSSxhQUFhLENBQUMsS0FBSyxDQUFDLENBQ2hDLGFBQWEsQ0FBRSxJQUFJLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxDQUNqRCxRQUFRLENBQUUsUUFBUSxDQUNsQixPQUFPLENBQUUsSUFBSSxDQUNiLGNBQWMsQ0FBRSxHQUFHLENBQ25CLFdBQVcsQ0FBRSxNQUFNLENBQ25CLFFBQVEsQ0FBRSxNQUFNLENBQ2hCLFdBQVcsQ0FBRSxTQUFTLENBQUMsQ0FBQyxPQUFPLENBQy9CLDJCQUEyQixDQUFFLFdBQy9CLENBQ0Esd0JBQVcsQ0FDVCxPQUFPLENBQUUsSUFBSSxpQkFBaUIsQ0FBQyxlQUFlLENBQUMsQ0FDL0MsSUFBSSxDQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDWixDQUNBLGlCQUFHLENBQ0gsd0JBQVUsQ0FBUyxDQUFHLENBQ3BCLGNBQWMsQ0FBRSxJQUNsQixDQUNBLHdCQUFXLENBQ1QsS0FBSyxDQUFFLElBQUksZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUNqQyxNQUFNLENBQUUsSUFBSSxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FDbkMsTUFBTSxDQUFFLE9BQU8sQ0FDZixPQUFPLENBQUUsSUFDWCxDQUNBLHdCQUFVLE9BQVEsQ0FDaEIsT0FBTyxDQUFFLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQ3BDLElBQUksQ0FBRSxJQUFJLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUMxQyxPQUFPLENBQUUsSUFBSSxDQUNiLFdBQVcsQ0FBRSxNQUFNLENBQ25CLGVBQWUsQ0FBRSxNQUNuQixDQUNBLHdCQUFXLENBQ1QsR0FBRyxDQUFFLElBQUksYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUM3QixLQUFLLENBQUUsSUFBSSxlQUFlLENBQUMsS0FBSyxDQUFDLENBQ2pDLE1BQU0sQ0FBRSxJQUFJLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxDQUNoQyxJQUFJLENBQUUsSUFBSSxjQUFjLENBQUMsRUFBRSxDQUFDLENBQzVCLE1BQU0sQ0FBRSxJQUFJLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUNsQyxLQUFLLENBQUUsSUFBSSxlQUFlLENBQUMsS0FBSyxDQUFDLENBQ2pDLFFBQVEsQ0FBRSxRQUFRLENBQ2xCLE9BQU8sQ0FBRSxLQUFLLENBQ2Qsa0JBQWtCLENBQUUsSUFBSSxDQUN4QixlQUFlLENBQUUsSUFBSSxDQUNyQixVQUFVLENBQUUsSUFBSSxDQUNoQixNQUFNLENBQUUsSUFBSSxDQUNaLFVBQVUsQ0FBRSxXQUFXLENBQ3ZCLGNBQWMsQ0FBRSxJQUNsQixDQUNBLHdCQUFVLHNCQUF1QixDQUMvQixVQUFVLENBQUUsV0FDZCxDQUVBLHdCQUFVLHdCQUF5QixDQUNqQyxVQUFVLENBQUUsSUFBSSx5QkFBeUIsQ0FBQyxvREFBb0QsQ0FDaEcsQ0FDQSx3QkFBVSxtQkFBb0IsQ0FDNUIsVUFBVSxDQUFFLElBQUkseUJBQXlCLENBQUMsb0RBQW9ELENBQ2hHIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbIlRvYXN0SXRlbS5zdmVsdGUiXX0= */");
	}

	// (98:4) {:else}
	function create_else_block$a(ctx) {
		let html_tag;
		let raw_value = /*item*/ ctx[0].msg + "";
		let html_anchor;

		const block = {
			c: function create() {
				html_tag = new HtmlTag(false);
				html_anchor = empty();
				html_tag.a = html_anchor;
			},
			m: function mount(target, anchor) {
				html_tag.m(raw_value, target, anchor);
				insert_dev(target, html_anchor, anchor);
			},
			p: function update(ctx, dirty) {
				if (dirty & /*item*/ 1 && raw_value !== (raw_value = /*item*/ ctx[0].msg + "")) html_tag.p(raw_value);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(html_anchor);
					html_tag.d();
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block$a.name,
			type: "else",
			source: "(98:4) {:else}",
			ctx
		});

		return block;
	}

	// (96:4) {#if item.component}
	function create_if_block_1$9(ctx) {
		let switch_instance;
		let switch_instance_anchor;
		let current;
		const switch_instance_spread_levels = [/*cprops*/ ctx[2]];
		var switch_value = /*item*/ ctx[0].component.src;

		function switch_props(ctx, dirty) {
			let switch_instance_props = {};

			for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
				switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
			}

			if (dirty !== undefined && dirty & /*cprops*/ 4) {
				switch_instance_props = assign(switch_instance_props, get_spread_update(switch_instance_spread_levels, [get_spread_object(/*cprops*/ ctx[2])]));
			}

			return {
				props: switch_instance_props,
				$$inline: true
			};
		}

		if (switch_value) {
			switch_instance = construct_svelte_component_dev(switch_value, switch_props(ctx));
		}

		const block = {
			c: function create() {
				if (switch_instance) create_component(switch_instance.$$.fragment);
				switch_instance_anchor = empty();
			},
			m: function mount(target, anchor) {
				if (switch_instance) mount_component(switch_instance, target, anchor);
				insert_dev(target, switch_instance_anchor, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				if (dirty & /*item*/ 1 && switch_value !== (switch_value = /*item*/ ctx[0].component.src)) {
					if (switch_instance) {
						group_outros();
						const old_component = switch_instance;

						transition_out(old_component.$$.fragment, 1, 0, () => {
							destroy_component(old_component, 1);
						});

						check_outros();
					}

					if (switch_value) {
						switch_instance = construct_svelte_component_dev(switch_value, switch_props(ctx, dirty));
						create_component(switch_instance.$$.fragment);
						transition_in(switch_instance.$$.fragment, 1);
						mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
					} else {
						switch_instance = null;
					}
				} else if (switch_value) {
					const switch_instance_changes = (dirty & /*cprops*/ 4)
					? get_spread_update(switch_instance_spread_levels, [get_spread_object(/*cprops*/ ctx[2])])
					: {};

					switch_instance.$set(switch_instance_changes);
				}
			},
			i: function intro(local) {
				if (current) return;
				if (switch_instance) transition_in(switch_instance.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				if (switch_instance) transition_out(switch_instance.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(switch_instance_anchor);
				}

				if (switch_instance) destroy_component(switch_instance, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_1$9.name,
			type: "if",
			source: "(96:4) {#if item.component}",
			ctx
		});

		return block;
	}

	// (102:2) {#if item.dismissable}
	function create_if_block$b(ctx) {
		let div;
		let mounted;
		let dispose;

		const block = {
			c: function create() {
				div = element("div");
				attr_dev(div, "class", "_toastBtn pe svelte-95rq8t");
				attr_dev(div, "role", "button");
				attr_dev(div, "tabindex", "0");
				add_location(div, file$q, 102, 4, 2271);
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);

				if (!mounted) {
					dispose = [
						listen_dev(div, "click", /*close*/ ctx[4], false, false, false, false),
						listen_dev(div, "keydown", /*keydown_handler*/ ctx[8], false, false, false, false)
					];

					mounted = true;
				}
			},
			p: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
				}

				mounted = false;
				run_all(dispose);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$b.name,
			type: "if",
			source: "(102:2) {#if item.dismissable}",
			ctx
		});

		return block;
	}

	function create_fragment$q(ctx) {
		let div1;
		let div0;
		let current_block_type_index;
		let if_block0;
		let t0;
		let t1;
		let progress_1;
		let current;
		let mounted;
		let dispose;
		const if_block_creators = [create_if_block_1$9, create_else_block$a];
		const if_blocks = [];

		function select_block_type(ctx, dirty) {
			if (/*item*/ ctx[0].component) return 0;
			return 1;
		}

		current_block_type_index = select_block_type(ctx);
		if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
		let if_block1 = /*item*/ ctx[0].dismissable && create_if_block$b(ctx);

		const block = {
			c: function create() {
				div1 = element("div");
				div0 = element("div");
				if_block0.c();
				t0 = space();
				if (if_block1) if_block1.c();
				t1 = space();
				progress_1 = element("progress");
				attr_dev(div0, "class", "_toastMsg svelte-95rq8t");
				toggle_class(div0, "pe", /*item*/ ctx[0].component);
				add_location(div0, file$q, 94, 2, 2048);
				attr_dev(progress_1, "class", "_toastBar svelte-95rq8t");
				progress_1.value = /*$progress*/ ctx[1];
				add_location(progress_1, file$q, 112, 2, 2500);
				attr_dev(div1, "role", "status");
				attr_dev(div1, "class", "_toastItem svelte-95rq8t");
				toggle_class(div1, "pe", /*item*/ ctx[0].pausable);
				add_location(div1, file$q, 85, 0, 1889);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div1, anchor);
				append_dev(div1, div0);
				if_blocks[current_block_type_index].m(div0, null);
				append_dev(div1, t0);
				if (if_block1) if_block1.m(div1, null);
				append_dev(div1, t1);
				append_dev(div1, progress_1);
				current = true;

				if (!mounted) {
					dispose = [
						listen_dev(div1, "mouseenter", /*mouseenter_handler*/ ctx[9], false, false, false, false),
						listen_dev(div1, "mouseleave", /*resume*/ ctx[6], false, false, false, false)
					];

					mounted = true;
				}
			},
			p: function update(ctx, [dirty]) {
				let previous_block_index = current_block_type_index;
				current_block_type_index = select_block_type(ctx);

				if (current_block_type_index === previous_block_index) {
					if_blocks[current_block_type_index].p(ctx, dirty);
				} else {
					group_outros();

					transition_out(if_blocks[previous_block_index], 1, 1, () => {
						if_blocks[previous_block_index] = null;
					});

					check_outros();
					if_block0 = if_blocks[current_block_type_index];

					if (!if_block0) {
						if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
						if_block0.c();
					} else {
						if_block0.p(ctx, dirty);
					}

					transition_in(if_block0, 1);
					if_block0.m(div0, null);
				}

				if (!current || dirty & /*item*/ 1) {
					toggle_class(div0, "pe", /*item*/ ctx[0].component);
				}

				if (/*item*/ ctx[0].dismissable) {
					if (if_block1) {
						if_block1.p(ctx, dirty);
					} else {
						if_block1 = create_if_block$b(ctx);
						if_block1.c();
						if_block1.m(div1, t1);
					}
				} else if (if_block1) {
					if_block1.d(1);
					if_block1 = null;
				}

				if (!current || dirty & /*$progress*/ 2) {
					prop_dev(progress_1, "value", /*$progress*/ ctx[1]);
				}

				if (!current || dirty & /*item*/ 1) {
					toggle_class(div1, "pe", /*item*/ ctx[0].pausable);
				}
			},
			i: function intro(local) {
				if (current) return;
				transition_in(if_block0);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block0);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div1);
				}

				if_blocks[current_block_type_index].d();
				if (if_block1) if_block1.d();
				mounted = false;
				run_all(dispose);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$q.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function check(prop, kind = 'undefined') {
		return typeof prop === kind;
	}

	function instance$q($$self, $$props, $$invalidate) {
		let $progress;
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('ToastItem', slots, []);
		let { item } = $$props;

		/** @type {any} */
		let next = item.initial;

		let prev = next;
		let paused = false;
		let cprops = {};

		/** @type {any} */
		let unlisten;

		const progress = tweened(item.initial, { duration: item.duration, easing: identity });
		validate_store(progress, 'progress');
		component_subscribe($$self, progress, value => $$invalidate(1, $progress = value));

		function close() {
			toast.pop(item.id);
		}

		function autoclose() {
			if ($progress === 1 || $progress === 0) close();
		}

		function pause() {
			if (!paused && $progress !== next) {
				progress.set($progress, { duration: 0 });
				paused = true;
			}
		}

		function resume() {
			if (paused) {
				const d = /** @type {any} */
				item.duration;

				const duration = d - d * (($progress - prev) / (next - prev));
				progress.set(next, { duration }).then(autoclose);
				paused = false;
			}
		}

		function listen(d = document) {
			if (check(d.hidden)) return;
			const handler = () => d.hidden ? pause() : resume();
			const name = 'visibilitychange';
			d.addEventListener(name, handler);
			unlisten = () => d.removeEventListener(name, handler);
			handler();
		}

		onMount(listen);

		onDestroy(() => {
			if (check(item.onpop, 'function')) {
				// @ts-ignore
				item.onpop(item.id);
			}

			unlisten && unlisten();
		});

		$$self.$$.on_mount.push(function () {
			if (item === undefined && !('item' in $$props || $$self.$$.bound[$$self.$$.props['item']])) {
				console.warn("<ToastItem> was created without expected prop 'item'");
			}
		});

		const writable_props = ['item'];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ToastItem> was created with unknown prop '${key}'`);
		});

		const keydown_handler = e => {
			if (e instanceof KeyboardEvent && ['Enter', ' '].includes(e.key)) close();
		};

		const mouseenter_handler = () => {
			if (item.pausable) pause();
		};

		$$self.$$set = $$props => {
			if ('item' in $$props) $$invalidate(0, item = $$props.item);
		};

		$$self.$capture_state = () => ({
			onMount,
			onDestroy,
			tweened,
			linear: identity,
			toast,
			item,
			next,
			prev,
			paused,
			cprops,
			unlisten,
			progress,
			close,
			autoclose,
			pause,
			resume,
			check,
			listen,
			$progress
		});

		$$self.$inject_state = $$props => {
			if ('item' in $$props) $$invalidate(0, item = $$props.item);
			if ('next' in $$props) $$invalidate(7, next = $$props.next);
			if ('prev' in $$props) prev = $$props.prev;
			if ('paused' in $$props) paused = $$props.paused;
			if ('cprops' in $$props) $$invalidate(2, cprops = $$props.cprops);
			if ('unlisten' in $$props) unlisten = $$props.unlisten;
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		$$self.$$.update = () => {
			if ($$self.$$.dirty & /*item*/ 1) {
				// `progress` has been renamed to `next`; shim included for backward compatibility, to remove in next major
				if (!check(item.progress)) {
					$$invalidate(0, item.next = item.progress, item);
				}
			}

			if ($$self.$$.dirty & /*next, item, $progress*/ 131) {
				if (next !== item.next) {
					$$invalidate(7, next = item.next);
					prev = $progress;
					paused = false;
					progress.set(next).then(autoclose);
				}
			}

			if ($$self.$$.dirty & /*item*/ 1) {
				if (item.component) {
					const { props = {}, sendIdTo } = item.component;

					$$invalidate(2, cprops = {
						...props,
						...sendIdTo && { [sendIdTo]: item.id }
					});
				}
			}
		};

		return [
			item,
			$progress,
			cprops,
			progress,
			close,
			pause,
			resume,
			next,
			keydown_handler,
			mouseenter_handler
		];
	}

	class ToastItem extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$q, create_fragment$q, safe_not_equal, { item: 0 }, add_css$o);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "ToastItem",
				options,
				id: create_fragment$q.name
			});
		}

		get item() {
			return this.$$.ctx[0];
		}

		set item(item) {
			this.$$set({ item });
			flush();
		}
	}

	create_custom_element(ToastItem, {"item":{}}, [], [], true);

	/* node_modules/@zerodevx/svelte-toast/SvelteToast.svelte generated by Svelte v4.2.18 */

	const { Object: Object_1$3 } = globals;
	const file$p = "node_modules/@zerodevx/svelte-toast/SvelteToast.svelte";

	function add_css$n(target) {
		append_styles(target, "svelte-1u812xz", "._toastContainer.svelte-1u812xz{top:var(--toastContainerTop, 1.5rem);right:var(--toastContainerRight, 2rem);bottom:var(--toastContainerBottom, auto);left:var(--toastContainerLeft, auto);position:fixed;margin:0;padding:0;list-style-type:none;pointer-events:none;z-index:var(--toastContainerZIndex, 9999)}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3ZlbHRlVG9hc3Quc3ZlbHRlIiwibWFwcGluZ3MiOiJBQXVDQSwrQkFBaUIsQ0FDZixHQUFHLENBQUUsSUFBSSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FDckMsS0FBSyxDQUFFLElBQUkscUJBQXFCLENBQUMsS0FBSyxDQUFDLENBQ3ZDLE1BQU0sQ0FBRSxJQUFJLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUN6QyxJQUFJLENBQUUsSUFBSSxvQkFBb0IsQ0FBQyxLQUFLLENBQUMsQ0FDckMsUUFBUSxDQUFFLEtBQUssQ0FDZixNQUFNLENBQUUsQ0FBQyxDQUNULE9BQU8sQ0FBRSxDQUFDLENBQ1YsZUFBZSxDQUFFLElBQUksQ0FDckIsY0FBYyxDQUFFLElBQUksQ0FDcEIsT0FBTyxDQUFFLElBQUksc0JBQXNCLENBQUMsS0FBSyxDQUMzQyIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJTdmVsdGVUb2FzdC5zdmVsdGUiXX0= */");
	}

	function get_each_context$6(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[4] = list[i];
		return child_ctx;
	}

	// (26:2) {#each items as item (item.id)}
	function create_each_block$6(key_1, ctx) {
		let li;
		let toastitem;
		let t;
		let li_class_value;
		let li_style_value;
		let li_intro;
		let li_outro;
		let rect;
		let stop_animation = noop$3;
		let current;

		toastitem = new ToastItem({
				props: { item: /*item*/ ctx[4] },
				$$inline: true
			});

		const block = {
			key: key_1,
			first: null,
			c: function create() {
				li = element("li");
				create_component(toastitem.$$.fragment);
				t = space();
				attr_dev(li, "class", li_class_value = "" + (null_to_empty(/*item*/ ctx[4].classes?.join(' ')) + " svelte-1u812xz"));
				attr_dev(li, "style", li_style_value = getCss(/*item*/ ctx[4].theme));
				add_location(li, file$p, 26, 4, 731);
				this.first = li;
			},
			m: function mount(target, anchor) {
				insert_dev(target, li, anchor);
				mount_component(toastitem, li, null);
				append_dev(li, t);
				current = true;
			},
			p: function update(new_ctx, dirty) {
				ctx = new_ctx;
				const toastitem_changes = {};
				if (dirty & /*items*/ 1) toastitem_changes.item = /*item*/ ctx[4];
				toastitem.$set(toastitem_changes);

				if (!current || dirty & /*items*/ 1 && li_class_value !== (li_class_value = "" + (null_to_empty(/*item*/ ctx[4].classes?.join(' ')) + " svelte-1u812xz"))) {
					attr_dev(li, "class", li_class_value);
				}

				if (!current || dirty & /*items*/ 1 && li_style_value !== (li_style_value = getCss(/*item*/ ctx[4].theme))) {
					attr_dev(li, "style", li_style_value);
				}
			},
			r: function measure() {
				rect = li.getBoundingClientRect();
			},
			f: function fix() {
				fix_position(li);
				stop_animation();
				add_transform(li, rect);
			},
			a: function animate() {
				stop_animation();
				stop_animation = create_animation(li, rect, flip, { duration: 200 });
			},
			i: function intro(local) {
				if (current) return;
				transition_in(toastitem.$$.fragment, local);

				if (local) {
					add_render_callback(() => {
						if (!current) return;
						if (li_outro) li_outro.end(1);
						li_intro = create_in_transition(li, fly, /*item*/ ctx[4].intro);
						li_intro.start();
					});
				}

				current = true;
			},
			o: function outro(local) {
				transition_out(toastitem.$$.fragment, local);
				if (li_intro) li_intro.invalidate();

				if (local) {
					li_outro = create_out_transition(li, fade, {});
				}

				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(li);
				}

				destroy_component(toastitem);
				if (detaching && li_outro) li_outro.end();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_each_block$6.name,
			type: "each",
			source: "(26:2) {#each items as item (item.id)}",
			ctx
		});

		return block;
	}

	function create_fragment$p(ctx) {
		let ul;
		let each_blocks = [];
		let each_1_lookup = new Map();
		let current;
		let each_value = ensure_array_like_dev(/*items*/ ctx[0]);
		const get_key = ctx => /*item*/ ctx[4].id;
		validate_each_keys(ctx, each_value, get_each_context$6, get_key);

		for (let i = 0; i < each_value.length; i += 1) {
			let child_ctx = get_each_context$6(ctx, each_value, i);
			let key = get_key(child_ctx);
			each_1_lookup.set(key, each_blocks[i] = create_each_block$6(key, child_ctx));
		}

		const block = {
			c: function create() {
				ul = element("ul");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				attr_dev(ul, "class", "_toastContainer svelte-1u812xz");
				add_location(ul, file$p, 24, 0, 664);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, ul, anchor);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(ul, null);
					}
				}

				current = true;
			},
			p: function update(ctx, [dirty]) {
				if (dirty & /*items, getCss*/ 1) {
					each_value = ensure_array_like_dev(/*items*/ ctx[0]);
					group_outros();
					for (let i = 0; i < each_blocks.length; i += 1) each_blocks[i].r();
					validate_each_keys(ctx, each_value, get_each_context$6, get_key);
					each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul, fix_and_outro_and_destroy_block, create_each_block$6, null, get_each_context$6);
					for (let i = 0; i < each_blocks.length; i += 1) each_blocks[i].a();
					check_outros();
				}
			},
			i: function intro(local) {
				if (current) return;

				for (let i = 0; i < each_value.length; i += 1) {
					transition_in(each_blocks[i]);
				}

				current = true;
			},
			o: function outro(local) {
				for (let i = 0; i < each_blocks.length; i += 1) {
					transition_out(each_blocks[i]);
				}

				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(ul);
				}

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].d();
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$p.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function getCss(theme) {
		return theme
		? Object.keys(theme).reduce((a, c) => `${a}${c}:${theme[c]};`, '')
		: undefined;
	}

	function instance$p($$self, $$props, $$invalidate) {
		let $toast;
		validate_store(toast, 'toast');
		component_subscribe($$self, toast, $$value => $$invalidate(3, $toast = $$value));
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('SvelteToast', slots, []);
		let { options = {} } = $$props;
		let { target = 'default' } = $$props;

		/** @type {import('./stores.js').SvelteToastOptions[]} */
		let items = [];

		const writable_props = ['options', 'target'];

		Object_1$3.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<SvelteToast> was created with unknown prop '${key}'`);
		});

		$$self.$$set = $$props => {
			if ('options' in $$props) $$invalidate(1, options = $$props.options);
			if ('target' in $$props) $$invalidate(2, target = $$props.target);
		};

		$$self.$capture_state = () => ({
			fade,
			fly,
			flip,
			toast,
			ToastItem,
			options,
			target,
			items,
			getCss,
			$toast
		});

		$$self.$inject_state = $$props => {
			if ('options' in $$props) $$invalidate(1, options = $$props.options);
			if ('target' in $$props) $$invalidate(2, target = $$props.target);
			if ('items' in $$props) $$invalidate(0, items = $$props.items);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		$$self.$$.update = () => {
			if ($$self.$$.dirty & /*target, options*/ 6) {
				toast._init(target, options);
			}

			if ($$self.$$.dirty & /*$toast, target*/ 12) {
				$$invalidate(0, items = $toast.filter(i => i.target === target));
			}
		};

		return [items, options, target, $toast];
	}

	class SvelteToast extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$p, create_fragment$p, safe_not_equal, { options: 1, target: 2 }, add_css$n);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "SvelteToast",
				options,
				id: create_fragment$p.name
			});
		}

		get options() {
			return this.$$.ctx[1];
		}

		set options(options) {
			this.$$set({ options });
			flush();
		}

		get target() {
			return this.$$.ctx[2];
		}

		set target(target) {
			this.$$set({ target });
			flush();
		}
	}

	create_custom_element(SvelteToast, {"options":{},"target":{}}, [], [], true);

	// Utility function to convert hex to HSL
	function hexToHSL(hex) {
	    let r = 0, g = 0, b = 0;
	    if (hex.length === 4) {
	        r = "0x" + hex[1] + hex[1];
	        g = "0x" + hex[2] + hex[2];
	        b = "0x" + hex[3] + hex[3];
	    } else if (hex.length === 7) {
	        r = "0x" + hex[1] + hex[2];
	        g = "0x" + hex[3] + hex[4];
	        b = "0x" + hex[5] + hex[6];
	    }
	    r /= 255;
	    g /= 255;
	    b /= 255;
	    let cmin = Math.min(r, g, b),
	        cmax = Math.max(r, g, b),
	        delta = cmax - cmin,
	        h = 0,
	        s = 0,
	        l = 0;
	    if (delta == 0)
	        h = 0;
	    else if (cmax == r)
	        h = ((g - b) / delta) % 6;
	    else if (cmax == g)
	        h = (b - r) / delta + 2;
	    else
	        h = (r - g) / delta + 4;
	    h = Math.round(h * 60);
	    if (h < 0)
	        h += 360;
	    l = (cmax + cmin) / 2;
	    s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
	    s = +(s * 100).toFixed(1);
	    l = +(l * 100).toFixed(1);
	    return [h, s, l];
	}

	// Function to generate HSL variants
	function generateHSLVariants(hsl, variants = 5) {
	    if (variants % 2 === 0) {
	        variants += 1; // Ensure the number of variants is odd
	    }
	    const [h, s, l] = hsl;
	    const result = [];
	    const step = 10;
	    const half = Math.floor(variants / 2);

	    for (let i = -half; i <= half; i++) {
	        const newL = Math.min(100, Math.max(0, l + i * step));
	        result.push(`hsl(${h}, ${s}%, ${newL}%)`);
	    }

	    return result;
	}

	// Function to get the spectrum of colors
	function getColorSpectrum(colorHex, variants = 5) {
	    const hsl = hexToHSL(colorHex);
	    return generateHSLVariants(hsl, variants);
	}

	// import re
	// import os

	// MAX_FILENAME_LENGTH = 200


	// def sanitize_filename(filename):
	//     sanitized_name = re.sub(r"[^\w\-]", "_", filename)
	//     return sanitized_name[:MAX_FILENAME_LENGTH]

	function toCamelCase(snakeStr) {
	    return snakeStr.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
	}

	// src/common/theme/theme.js

	const initialOrchestraColors = {
	    primary: '#1e3a5f',
	    secondary: '#37474f',
	    success: '#388e3c',
	    warning: '#fbc02d',
	    danger: '#d32f2f',
	    info: '#1976d2',
	    light: '#424242',
	    dark: '#121212',
	    accent1: '#536dfe',
	    accent2: '#d500f9',
	    accent3: '#cddc39',
	    cardBackground: '#1c1c1c',
	    cardBorder: '#333333',
	    containerBackground: '#121212',
	    containerBorder: '#212121',
	};

	const initialBaseSiteColors = {
	    primary: '#3f51b5',
	    secondary: '#f50057',
	    success: '#4caf50',
	    warning: '#ff9800',
	    danger: '#f44336',
	    info: '#2196f3',
	    light: '#f5f5f5',
	    dark: '#212121',
	    accent1: '#ff5722',
	    accent2: '#795548',
	    accent3: '#607d8b',
	    cardBackground: '#ffffff',
	    cardBorder: '#e0e0e0',
	    containerBackground: '#fafafa',
	    containerBorder: '#eeeeee',
	};

	const initialOrchestraTypography = {
	    h1: { fontFamily: 'Lato', fontSize: '32px', lineHeight: '1.2', fontWeight: '700' },
	    h2: { fontFamily: 'Lato', fontSize: '28px', lineHeight: '1.3', fontWeight: '600' },
	    h3: { fontFamily: 'Lato', fontSize: '24px', lineHeight: '1.4', fontWeight: '500' },
	    h4: { fontFamily: 'Lato', fontSize: '20px', lineHeight: '1.5', fontWeight: '500' },
	    h5: { fontFamily: 'Lato', fontSize: '18px', lineHeight: '1.6', fontWeight: '400' },
	    h6: { fontFamily: 'Lato', fontSize: '16px', lineHeight: '1.7', fontWeight: '400' },
	    p: { fontFamily: 'Lato', fontSize: '16px', lineHeight: '1.5', fontWeight: '400' },
	    a: { fontFamily: 'Lato', fontSize: '16px', lineHeight: '1.5', fontWeight: '400' },
	};

	const mainHeight = writable('100vh');
	const orchestraThemeColors = writable(initialOrchestraColors);
	const orchestraThemeMode = writable('dark');
	const orchestraThemeTypography = writable(initialOrchestraTypography);
	const baseSiteTheme = writable(initialBaseSiteColors);

	user.subscribe((userData) => {
	    if (userData && userData.userprofile) {
	        mainHeight.set(userData.userprofile.full_height ? '100vh' : '90vh');
	    }
	    const height = get_store_value(mainHeight);
	    createLayoutCSSVariable({ 'main-height': height }, 'orchestra');
	    createLayoutCSSVariable({ 'main-height': height }, 'base-site');
	});

	function createLayoutCSSVariable(theme, prefix) {
	    const styleElement = document.createElement('style');
	    styleElement.setAttribute('data-theme-layout', prefix);
	    let cssContent = `:root { \n`;

	    Object.keys(theme).forEach(key => {
	        cssContent += `  --${prefix}-${key}: ${theme[key]}; \n`;
	    });

	    cssContent += '}\n';
	    styleElement.textContent = cssContent;

	    // Remove any previous style element related to this theme
	    const previousStyle = document.querySelector(`style[data-theme-layout="${prefix}"]`);
	    if (previousStyle) {
	        previousStyle.remove();
	    }

	    // Append the new style to the document head
	    document.head.appendChild(styleElement);
	}

	const keyMapping = {
	    card_background: 'cardBackground',
	    card_border: 'cardBorder',
	    container_background: 'containerBackground',
	    container_border: 'containerBorder'
	};

	function convertKeysToCamelCase(obj) {
	    const newObj = {};
	    for (const key in obj) {
	        if (keyMapping[key]) {
	            newObj[keyMapping[key]] = obj[key];
	        } else {
	            newObj[toCamelCase(key)] = obj[key];
	        }
	    }
	    return newObj;
	}

	function createPaletteCSSVariables(theme, themeMode, prefix) {
	    const styleElement = document.createElement('style');
	    styleElement.setAttribute('data-theme-palette', prefix);
	    let cssContent = `:root { \n`;

	    const camelCaseTheme = convertKeysToCamelCase(theme);
	    const colorKeys = ['primary', 'secondary', 'accent1', 'accent2', 'accent3', 'success', 'warning', 'danger', 'info', 'light', 'dark', 'cardBackground', 'cardBorder', 'containerBackground', 'containerBorder'];

	    colorKeys.forEach(key => {
	        const mainColor = camelCaseTheme[key];
	        const spectrum = getColorSpectrum(mainColor);
	        spectrum.forEach((color, index) => {
	            cssContent += `  --${prefix}-${key}-${index + 1}: ${color}; \n`;
	        });
	    });

	    const utilities = {
	        textColor: themeMode === 'dark' ? '#fff' : '#000',
	        linkColor: themeMode === 'dark' ? '#1e90ff' : '#007bff',
	        
	        backgroundColor: themeMode === 'dark' ? '#333' : '#fff',
	        borderColor: themeMode === 'dark' ? '#444' : '#ddd',
	        boxShadow: themeMode === 'dark' ? '0 4px 6px rgba(0, 0, 0, 0.1)' : '0 4px 6px rgba(0, 0, 0, 0.05)',
	        
	        inputBackgroundColor: themeMode === 'dark' ? '#555' : '#fff',
	        inputTextColor: themeMode === 'dark' ? '#fff' : '#000',
	        inputBorderColor: themeMode === 'dark' ? '#666' : '#ccc',

	        disabledTextColor: themeMode === 'dark' ? '#666' : '#ccc',
	        disabledBackgroundColor: themeMode === 'dark' ? '#ccc' : '#666',
	        
	        tableBackgroundColor: themeMode === 'dark' ? '#222' : '#f9f9f9',
	        tableBorderColor: themeMode === 'dark' ? '#444' : '#ddd',
	        tableTextColor: themeMode === 'dark' ? '#fff' : '#000',
	        tableHeaderBackgroundColor: themeMode === 'dark' ? '#333' : '#f1f1f1',
	        tableRowHoverColor: themeMode === 'dark' ? '#555' : '#ddd',
	        tableRowActiveColor: themeMode === 'dark' ? '#3a3' : '#8f8',
	        tableRowSelectedColor: themeMode === 'dark' ? '#36f' : '#99f',
	        tableRowDisabledColor: themeMode === 'dark' ? '#f33' : '#f99',
	        tableRowStripeColor: themeMode === 'dark' ? '#2a2a2a' : '#e7e7e7',
	        
	        alertBackgroundColorActive: themeMode === 'dark' ? '#5a1a1a' : '#f8d7da',
	        alertBackgroundColorAcknowledged: themeMode === 'dark' ? '#5c471c' : '#fff3cd',
	        alertBackgroundColorResolved: themeMode === 'dark' ? '#2e5c32' : '#d4edda',
	        alertTextColor: themeMode === 'dark' ? '#fff' : '#000',

	        // * Highlight (Code Formatting)
	        highlightBackgroundColor: themeMode === 'dark' ? '#444' : '#f0f0f0',

	        // ? Elevation
	        elevation1: themeMode === 'dark' ? '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)' : '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
	        elevation2: themeMode === 'dark' ? '0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23)' : '0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23)',
	        elevation3: themeMode === 'dark' ? '0 10px 20px rgba(0, 0, 0, 0.19), 0 6px 6px rgba(0, 0, 0, 0.23)' : '0 10px 20px rgba(0, 0, 0, 0.19), 0 6px 6px rgba(0, 0, 0, 0.23)',
	        elevation4: themeMode === 'dark' ? '0 15px 25px rgba(0, 0, 0, 0.22), 0 10px 10px rgba(0, 0, 0, 0.2)' : '0 15px 25px rgba(0, 0, 0, 0.22), 0 10px 10px rgba(0, 0, 0, 0.2)',
	        elevation5: themeMode === 'dark' ? '0 20px 40px rgba(0, 0, 0, 0.24), 0 20px 20px rgba(0, 0, 0, 0.22)' : '0 20px 40px rgba(0, 0, 0, 0.24), 0 20px 20px rgba(0, 0, 0, 0.22)',

	        // ~ Transitions
	        transitionBoxShadow: 'box-shadow 0.2s ease-in-out',
	        transitionBackgroundColor: 'background-color 0.2s ease-in',
	        transitionBorderColor: 'border-color 0.25s linear',
	        transitionColor: 'color 0.3s ease-out',
	        transitionTransform: 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
	        transitionOpacity: 'opacity 0.2s ease-in-out',
	        transitionFontSize: 'font-size 0.4s ease-in-out',

	        // ! Generic States
	        stateSelectedColor: themeMode === 'dark' ? '#3b4d61' : '#dce7f1',
	        stateActiveColor: themeMode === 'dark' ? '#2a3b4c' : '#b3c4d6',
	        stateDisabledColor: themeMode === 'dark' ? '#555' : '#ccc',
	        stateHoverColor: themeMode === 'dark' ? '#1f2a3a' : '#e0e0e0',

	        // Additional Colors
	        navBackgroundColor: theme.cardBackground,
	        navTextColor: theme.primary,
	        navLinkColor: theme.accent1,

	        footerBackgroundColor: theme.cardBackground,
	        footerTextColor: themeMode === 'dark' ? '#fff' : '#000',

	        heroBackgroundColor: theme.containerBackground,
	        heroTextColor: themeMode === 'dark' ? '#fff' : '#000',

	        sectionBackgroundColor: themeMode === 'dark' ? '#444' : '#f9f9f9',
	        sectionTextColor: themeMode === 'dark' ? '#fff' : '#000',

	        asideBackgroundColor: themeMode === 'dark' ? '#555' : '#e7e7e7',
	        asideTextColor: themeMode === 'dark' ? '#fff' : '#000',

	        articleBackgroundColor: themeMode === 'dark' ? '#444' : '#fff',
	        articleTextColor: themeMode === 'dark' ? '#fff' : '#000',
	        articleBorderColor: themeMode === 'dark' ? '#555' : '#ddd',
	        articleHeaderColor: themeMode === 'dark' ? '#1e90ff' : '#007bff',
	        articleLinkColor: themeMode === 'dark' ? '#1e90ff' : '#007bff',

	        draggingBgColor: theme.secondary,
	        draggingBorderColor: theme.primary,
	        dropActiveBgColor: theme.accent1,
	        dropTargetBgColor: theme.accent2,
	        canDropBorderColor: theme.accent3,
	    };

	    Object.keys(utilities).forEach(key => {
	        cssContent += `  --${prefix}-${key}: ${utilities[key]}; \n`;
	    });

	    cssContent += '}\n';
	    styleElement.textContent = cssContent;

	    const previousStyle = document.querySelector(`style[data-theme-palette="${prefix}"]`);
	    if (previousStyle) {
	        previousStyle.remove();
	    }

	    document.head.appendChild(styleElement);
	}

	// function createPaletteCSSVariables(theme, themeMode, prefix) {
	//     const styleElement = document.createElement('style');
	//     styleElement.setAttribute('data-theme-palette', prefix);
	//     let cssContent = `:root { \n`;

	//     const camelCaseTheme = convertKeysToCamelCase(theme);
	//     const colorKeys = ['primary', 'secondary', 'accent1', 'accent2', 'accent3', 'success', 'warning', 'danger', 'info', 'light', 'dark', 'cardBackground', 'cardBorder', 'containerBackground', 'containerBorder'];

	//     colorKeys.forEach(key => {
	//         const mainColor = camelCaseTheme[key];
	//         const spectrum = getColorSpectrum(mainColor);
	//         spectrum.forEach((color, index) => {
	//             cssContent += `  --${prefix}-${key}-${index + 1}: ${color}; \n`;
	//         });
	//     });

	//     const utilities = {
	//         textColor: `var(--${prefix}-textColor, ${themeMode === 'dark' ? '#fff' : '#000'})`,
	//         linkColor: `var(--${prefix}-linkColor, ${themeMode === 'dark' ? '#1e90ff' : '#007bff'})`,
	        
	//         backgroundColor: `var(--${prefix}-backgroundColor, ${themeMode === 'dark' ? '#333' : '#fff'})`,
	//         borderColor: `var(--${prefix}-borderColor, ${themeMode === 'dark' ? '#444' : '#ddd'})`,
	//         boxShadow: `var(--${prefix}-boxShadow, ${themeMode === 'dark' ? '0 4px 6px rgba(0, 0, 0, 0.1)' : '0 4px 6px rgba(0, 0, 0, 0.05)'})`,
	        
	//         inputBackgroundColor: `var(--${prefix}-cardBackground-4)`,
	//         inputTextColor: `var(--${prefix}-textColor)`,
	//         inputBorderColor: `var(--${prefix}-cardBorder-4)`,
	        
	//         tableBackgroundColor: `var(--${prefix}-tableBackgroundColor, ${themeMode === 'dark' ? '#222' : '#f9f9f9'})`,
	//         tableBorderColor: `var(--${prefix}-tableBorderColor, ${themeMode === 'dark' ? '#444' : '#ddd'})`,
	//         tableTextColor: `var(--${prefix}-tableTextColor, ${themeMode === 'dark' ? '#fff' : '#000'})`,
	//         tableHeaderBackgroundColor: `var(--${prefix}-tableHeaderBackgroundColor, ${themeMode === 'dark' ? '#333' : '#f1f1f1'})`,
	//         tableRowHoverColor: `var(--${prefix}-tableRowHoverColor, ${themeMode === 'dark' ? '#555' : '#ddd'})`,
	//         tableRowActiveColor: `var(--${prefix}-tableRowActiveColor, ${themeMode === 'dark' ? '#3a3' : '#8f8'})`,
	//         tableRowSelectedColor: `var(--${prefix}-tableRowSelectedColor, ${themeMode === 'dark' ? '#36f' : '#99f'})`,
	//         tableRowDisabledColor: `var(--${prefix}-tableRowDisabledColor, ${themeMode === 'dark' ? '#f33' : '#f99'})`,
	//         tableRowStripeColor: `var(--${prefix}-tableRowStripeColor, ${themeMode === 'dark' ? '#2a2a2a' : '#e7e7e7'})`,
	        
	//         alertBackgroundColorActive: `var(--${prefix}-alertBackgroundColorActive, ${themeMode === 'dark' ? '#5a1a1a' : '#f8d7da'})`,
	//         alertBackgroundColorAcknowledged: `var(--${prefix}-alertBackgroundColorAcknowledged, ${themeMode === 'dark' ? '#5c471c' : '#fff3cd'})`,
	//         alertBackgroundColorResolved: `var(--${prefix}-alertBackgroundColorResolved, ${themeMode === 'dark' ? '#2e5c32' : '#d4edda'})`,
	//         alertTextColor: `var(--${prefix}-alertTextColor, ${themeMode === 'dark' ? '#fff' : '#000'})`,

	//         // * Highlight (Code Formatting)
	//         highlightBackgroundColor: `var(--${prefix}-highlightBackgroundColor, ${themeMode === 'dark' ? '#444' : '#f0f0f0'})`,

	//         // ? Elevation
	//         elevation1: `var(--${prefix}-elevation1, ${themeMode === 'dark' ? '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)' : '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)'})`,
	//         elevation2: `var(--${prefix}-elevation2, ${themeMode === 'dark' ? '0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23)' : '0 3px 6px rgba(0, 0, 0, 0.16), 0 3px 6px rgba(0, 0, 0, 0.23)'})`,
	//         elevation3: `var(--${prefix}-elevation3, ${themeMode === 'dark' ? '0 10px 20px rgba(0, 0, 0, 0.19), 0 6px 6px rgba(0, 0, 0, 0.23)' : '0 10px 20px rgba(0, 0, 0, 0.19), 0 6px 6px rgba(0, 0, 0, 0.23)'})`,
	//         elevation4: `var(--${prefix}-elevation4, ${themeMode === 'dark' ? '0 15px 25px rgba(0, 0, 0, 0.22), 0 10px 10px rgba(0, 0, 0, 0.2)' : '0 15px 25px rgba(0, 0, 0, 0.22), 0 10px 10px rgba(0, 0, 0, 0.2)'})`,
	//         elevation5: `var(--${prefix}-elevation5, ${themeMode === 'dark' ? '0 20px 40px rgba(0, 0, 0, 0.24), 0 20px 20px rgba(0, 0, 0, 0.22)' : '0 20px 40px rgba(0, 0, 0, 0.24), 0 20px 20px rgba(0, 0, 0, 0.22)'})`,

	//         // ~ Transitions
	//         transitionBoxShadow: 'box-shadow 0.2s ease-in-out',
	//         transitionBackgroundColor: 'background-color 0.2s ease-in',
	//         transitionBorderColor: 'border-color 0.25s linear',
	//         transitionColor: 'color 0.3s ease-out',
	//         transitionTransform: 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
	//         transitionOpacity: 'opacity 0.2s ease-in-out',
	//         transitionFontSize: 'font-size 0.4s ease-in-out',

	//         // ! Generic States
	//         stateSelectedColor: `var(--${prefix}-stateSelectedColor, ${themeMode === 'dark' ? '#3b4d61' : '#dce7f1'})`,
	//         stateActiveColor: `var(--${prefix}-stateActiveColor, ${themeMode === 'dark' ? '#2a3b4c' : '#b3c4d6'})`,
	//         stateDisabledColor: `var(--${prefix}-stateDisabledColor, ${themeMode === 'dark' ? '#555' : '#ccc'})`,
	//         stateHoverColor: `var(--${prefix}-stateHoverColor, ${themeMode === 'dark' ? '#1f2a3a' : '#e0e0e0'})`,

	//         // Additional Colors
	//         navBackgroundColor: `var(--${prefix}-cardBackground)`,
	//         navTextColor: `var(--${prefix}-primary)`,
	//         navLinkColor: `var(--${prefix}-accent1)`,

	//         footerBackgroundColor: `var(--${prefix}-cardBackground)`,
	//         footerTextColor: `var(--${prefix}-textColor)`,

	//         heroBackgroundColor: `var(--${prefix}-containerBackground)`,
	//         heroTextColor: `var(--${prefix}-textColor)`,

	//         sectionBackgroundColor: `var(--${prefix}-sectionBackgroundColor, ${themeMode === 'dark' ? '#444' : '#f9f9f9'})`,
	//         sectionTextColor: `var(--${prefix}-sectionTextColor, ${themeMode === 'dark' ? '#fff' : '#000'})`,

	//         asideBackgroundColor: `var(--${prefix}-asideBackgroundColor, ${themeMode === 'dark' ? '#555' : '#e7e7e7'})`,
	//         asideTextColor: `var(--${prefix}-asideTextColor, ${themeMode === 'dark' ? '#fff' : '#000'})`,

	//         articleBackgroundColor: `var(--${prefix}-articleBackgroundColor, ${themeMode === 'dark' ? '#444' : '#fff'})`,
	//         articleTextColor: `var(--${prefix}-articleTextColor, ${themeMode === 'dark' ? '#fff' : '#000'})`,
	//         articleBorderColor: `var(--${prefix}-articleBorderColor, ${themeMode === 'dark' ? '#555' : '#ddd'})`,
	//         articleHeaderColor: `var(--${prefix}-articleHeaderColor, ${themeMode === 'dark' ? '#1e90ff' : '#007bff'})`,
	//         articleLinkColor: `var(--${prefix}-articleLinkColor, ${themeMode === 'dark' ? '#1e90ff' : '#007bff'})`,
	//     };

	//     Object.keys(utilities).forEach(key => {
	//         cssContent += `  --${prefix}-${key}: ${utilities[key]}; \n`;
	//     });

	//     cssContent += '}\n';
	//     styleElement.textContent = cssContent;

	//     const previousStyle = document.querySelector(`style[data-theme-palette="${prefix}"]`);
	//     if (previousStyle) {
	//         previousStyle.remove();
	//     }

	//     document.head.appendChild(styleElement);
	// }


	function createTypographyCSSVariables(typography, prefix) {
	    const styleElement = document.createElement('style');
	    styleElement.setAttribute('data-theme-typography', prefix);
	    let cssContent = `:root { \n`;

	    Object.keys(typography).forEach(key => {
	        const typographyProperties = typography[key];
	        Object.keys(typographyProperties).forEach(prop => {
	            cssContent += `  --${prefix}-${key}-${prop}: ${typographyProperties[prop]}; \n`;
	        });
	    });

	    cssContent += '}\n';
	    styleElement.textContent = cssContent;

	    const previousStyle = document.querySelector(`style[data-theme-typography="${prefix}"]`);
	    if (previousStyle) {
	        previousStyle.remove();
	    }

	    document.head.appendChild(styleElement);
	}

	orchestraThemeColors.subscribe((newTheme) => {
	    const themeMode = get_store_value(orchestraThemeMode);
	    createPaletteCSSVariables(newTheme, themeMode, 'orchestra');
	});

	baseSiteTheme.subscribe((newTheme) => {
	    const themeMode = get_store_value(orchestraThemeMode);
	    createPaletteCSSVariables(newTheme, themeMode, 'base-site');
	});

	orchestraThemeTypography.subscribe((newTypography) => {
	    createTypographyCSSVariables(newTypography, 'orchestra');
	});

	// ? Initial CSS update
	createPaletteCSSVariables(initialOrchestraColors, get_store_value(orchestraThemeMode), 'orchestra');
	createPaletteCSSVariables(initialBaseSiteColors, get_store_value(orchestraThemeMode), 'base-site');
	createTypographyCSSVariables(initialOrchestraTypography, 'orchestra');

	// stores.js
	let currentDecision = writable(null);
	let currentOption = writable(null);

	function getDecisionImageUrl(image) {
	    return api$1.assets[image.type]
	        ? `${api$1.assets[image.type]}/${image.ext_src}`
	        : `${api$1.assets.misc}/${image.ext_src}`;
	}

	// * Subscribe to thisPath to set currentConfiguration
	// thisPath.subscribe(path => {
	    // if (path) {
	    //     loadConfigurations(path.id)
	    // }

	    // const fetchedConfigurations = get(configurations);
	    // if (fetchedConfigurations && fetchedConfigurations.length > 0) {
	    //     currentConfiguration.set(fetchedConfigurations[0]);
	    // } else {
	    //     currentConfiguration.set(null);
	    // }
	// });

	// thisPath.subscribe(path => {
	//     if (path && path.configurations && path.configurations.length > 0) {
	//         currentConfiguration.set(path.configurations[0]);
	//     } else {
	//         currentConfiguration.set(null);
	//     }
	// });

	// // * Subscribe to currentConfiguration to update decisions and currentDecision
	// currentConfiguration.subscribe(configuration => {
	//     if (configuration) {
	//         loadDecisions(configuration.id)
	//         const sortedDecisions = [...configuration.decisions].sort((a, b) => a.order - b.order);
	//         decisions.set(sortedDecisions);

	//         if (sortedDecisions.length > 0) {
	//             currentDecision.set(sortedDecisions[0]);
	//         } else {
	//             currentDecision.set(null);
	//         }
	//     } else {
	//         decisions.set([]);
	//         currentDecision.set(null);
	//     }
	// });

	// * Subscribe to currentDecision to update currentOption
	currentDecision.subscribe(decision => {
	    if (decision && decision.options && decision.options.length > 0) {
	        currentOption.set(decision.options[0]);
	    } else {
	        currentOption.set(null);
	    }
	});

	/* src/components/media/Image.svelte generated by Svelte v4.2.18 */
	const file$o = "src/components/media/Image.svelte";

	function add_css$m(target) {
		append_styles(target, "svelte-1dbxaux", "img.svelte-1dbxaux{height:auto;border-radius:8px;margin-bottom:10px;outline:1px solid darkgray}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSW1hZ2Uuc3ZlbHRlIiwibWFwcGluZ3MiOiJBQVFJLGtCQUFJLENBQ0EsTUFBTSxDQUFFLElBQUksQ0FDWixhQUFhLENBQUUsR0FBRyxDQUNsQixhQUFhLENBQUUsSUFBSSxDQUNuQixPQUFPLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUN2QiIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJJbWFnZS5zdmVsdGUiXX0= */");
	}

	// (17:0) {#if image}
	function create_if_block$a(ctx) {
		let img;
		let img_src_value;
		let img_alt_value;
		let img_style_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = getDecisionImageUrl(/*image*/ ctx[0]))) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", img_alt_value = /*image*/ ctx[0].title || 'Image for the current option');
				attr_dev(img, "class", "option-image svelte-1dbxaux");

				attr_dev(img, "style", img_style_value = /*maxWidth*/ ctx[1]
				? `max-width: ${/*maxWidth*/ ctx[1]}`
				: '');

				add_location(img, file$o, 17, 4, 308);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			p: function update(ctx, dirty) {
				if (dirty & /*image*/ 1 && !src_url_equal(img.src, img_src_value = getDecisionImageUrl(/*image*/ ctx[0]))) {
					attr_dev(img, "src", img_src_value);
				}

				if (dirty & /*image*/ 1 && img_alt_value !== (img_alt_value = /*image*/ ctx[0].title || 'Image for the current option')) {
					attr_dev(img, "alt", img_alt_value);
				}

				if (dirty & /*maxWidth*/ 2 && img_style_value !== (img_style_value = /*maxWidth*/ ctx[1]
				? `max-width: ${/*maxWidth*/ ctx[1]}`
				: '')) {
					attr_dev(img, "style", img_style_value);
				}
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$a.name,
			type: "if",
			source: "(17:0) {#if image}",
			ctx
		});

		return block;
	}

	function create_fragment$o(ctx) {
		let if_block_anchor;
		let if_block = /*image*/ ctx[0] && create_if_block$a(ctx);

		const block = {
			c: function create() {
				if (if_block) if_block.c();
				if_block_anchor = empty();
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				if (if_block) if_block.m(target, anchor);
				insert_dev(target, if_block_anchor, anchor);
			},
			p: function update(ctx, [dirty]) {
				if (/*image*/ ctx[0]) {
					if (if_block) {
						if_block.p(ctx, dirty);
					} else {
						if_block = create_if_block$a(ctx);
						if_block.c();
						if_block.m(if_block_anchor.parentNode, if_block_anchor);
					}
				} else if (if_block) {
					if_block.d(1);
					if_block = null;
				}
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(if_block_anchor);
				}

				if (if_block) if_block.d(detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$o.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$o($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('Image', slots, []);
		let { image } = $$props;
		let { maxWidth = null } = $$props;

		$$self.$$.on_mount.push(function () {
			if (image === undefined && !('image' in $$props || $$self.$$.bound[$$self.$$.props['image']])) {
				console.warn("<Image> was created without expected prop 'image'");
			}
		});

		const writable_props = ['image', 'maxWidth'];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Image> was created with unknown prop '${key}'`);
		});

		$$self.$$set = $$props => {
			if ('image' in $$props) $$invalidate(0, image = $$props.image);
			if ('maxWidth' in $$props) $$invalidate(1, maxWidth = $$props.maxWidth);
		};

		$$self.$capture_state = () => ({ getDecisionImageUrl, image, maxWidth });

		$$self.$inject_state = $$props => {
			if ('image' in $$props) $$invalidate(0, image = $$props.image);
			if ('maxWidth' in $$props) $$invalidate(1, maxWidth = $$props.maxWidth);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [image, maxWidth];
	}

	class Image extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$o, create_fragment$o, safe_not_equal, { image: 0, maxWidth: 1 }, add_css$m);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "Image",
				options,
				id: create_fragment$o.name
			});
		}

		get image() {
			return this.$$.ctx[0];
		}

		set image(image) {
			this.$$set({ image });
			flush();
		}

		get maxWidth() {
			return this.$$.ctx[1];
		}

		set maxWidth(maxWidth) {
			this.$$set({ maxWidth });
			flush();
		}
	}

	create_custom_element(Image, {"image":{},"maxWidth":{}}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/NavBar.svelte generated by Svelte v4.2.18 */
	const file$n = "src/orchestraUi/DevTools/SiteDesignPreview/NavBar.svelte";

	function add_css$l(target) {
		append_styles(target, "svelte-q7xgxu", "nav.svelte-q7xgxu.svelte-q7xgxu{display:flex;justify-content:space-between;align-items:center;padding:10px 20px;z-index:3001}.nav-logo.svelte-q7xgxu img.svelte-q7xgxu,.nav-logo.svelte-q7xgxu h1.svelte-q7xgxu{max-height:50px}.nav-list.svelte-q7xgxu.svelte-q7xgxu{display:flex;gap:20px;flex-direction:row}.nav-list.small.svelte-q7xgxu.svelte-q7xgxu{display:none}.nav-list.svelte-q7xgxu li.svelte-q7xgxu{list-style:none}.nav-list.svelte-q7xgxu a.svelte-q7xgxu{text-decoration:none;font-size:16px}.hamburger.svelte-q7xgxu.svelte-q7xgxu{cursor:pointer;font-size:24px;background:none;border:none;color:var(--orchestra-textColor)}.nav-list.mobile.svelte-q7xgxu.svelte-q7xgxu{display:none;flex-direction:column;position:absolute;top:80px;right:10px;padding:10px;border-radius:5px;box-shadow:0 4px 8px rgba(0, 0, 0, 0.1);background-color:var(--orchestra-cardBackground-2);z-index:3001}.nav-list.mobile.show.svelte-q7xgxu.svelte-q7xgxu{display:flex}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTmF2QmFyLnN2ZWx0ZSIsIm1hcHBpbmdzIjoiQUEyQ0ksK0JBQUksQ0FDQSxPQUFPLENBQUUsSUFBSSxDQUNiLGVBQWUsQ0FBRSxhQUFhLENBQzlCLFdBQVcsQ0FBRSxNQUFNLENBQ25CLE9BQU8sQ0FBRSxJQUFJLENBQUMsSUFBSSxDQUNsQixPQUFPLENBQUUsSUFDYixDQUVBLHVCQUFTLENBQUMsaUJBQUcsQ0FBRSx1QkFBUyxDQUFDLGdCQUFHLENBQ3hCLFVBQVUsQ0FBRSxJQUNoQixDQUVBLHFDQUFVLENBQ04sT0FBTyxDQUFFLElBQUksQ0FDYixHQUFHLENBQUUsSUFBSSxDQUNULGNBQWMsQ0FBRSxHQUNwQixDQUVBLFNBQVMsa0NBQU8sQ0FDWixPQUFPLENBQUUsSUFDYixDQUVBLHVCQUFTLENBQUMsZ0JBQUcsQ0FDVCxVQUFVLENBQUUsSUFDaEIsQ0FFQSx1QkFBUyxDQUFDLGVBQUUsQ0FDUixlQUFlLENBQUUsSUFBSSxDQUNyQixTQUFTLENBQUUsSUFDZixDQUVBLHNDQUFXLENBQ1AsTUFBTSxDQUFFLE9BQU8sQ0FDZixTQUFTLENBQUUsSUFBSSxDQUNmLFVBQVUsQ0FBRSxJQUFJLENBQ2hCLE1BQU0sQ0FBRSxJQUFJLENBQ1osS0FBSyxDQUFFLElBQUkscUJBQXFCLENBQ3BDLENBRUEsU0FBUyxtQ0FBUSxDQUNiLE9BQU8sQ0FBRSxJQUFJLENBQ2IsY0FBYyxDQUFFLE1BQU0sQ0FDdEIsUUFBUSxDQUFFLFFBQVEsQ0FDbEIsR0FBRyxDQUFFLElBQUksQ0FDVCxLQUFLLENBQUUsSUFBSSxDQUNYLE9BQU8sQ0FBRSxJQUFJLENBQ2IsYUFBYSxDQUFFLEdBQUcsQ0FDbEIsVUFBVSxDQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQ3hDLGdCQUFnQixDQUFFLElBQUksNEJBQTRCLENBQUMsQ0FDbkQsT0FBTyxDQUFFLElBQ2IsQ0FFQSxTQUFTLE9BQU8saUNBQU0sQ0FDbEIsT0FBTyxDQUFFLElBQ2IiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiTmF2QmFyLnN2ZWx0ZSJdfQ== */");
	}

	// (111:8) {:else}
	function create_else_block_1$4(ctx) {
		let h1;

		const block = {
			c: function create() {
				h1 = element("h1");
				h1.textContent = `${brokerageName}`;
				attr_dev(h1, "class", "svelte-q7xgxu");
				add_location(h1, file$n, 111, 12, 2624);
			},
			m: function mount(target, anchor) {
				insert_dev(target, h1, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(h1);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block_1$4.name,
			type: "else",
			source: "(111:8) {:else}",
			ctx
		});

		return block;
	}

	// (103:8) {#if useNavLogoImage}
	function create_if_block_1$8(ctx) {
		let current_block_type_index;
		let if_block;
		let if_block_anchor;
		let current;
		const if_block_creators = [create_if_block_2$4, create_if_block_3$3, create_else_block$9];
		const if_blocks = [];

		function select_block_type_1(ctx, dirty) {
			if (navLogo && navLogo?.ext_src) return 0;
			if (navLogo) return 1;
			return 2;
		}

		current_block_type_index = select_block_type_1();
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

		const block = {
			c: function create() {
				if_block.c();
				if_block_anchor = empty();
			},
			m: function mount(target, anchor) {
				if_blocks[current_block_type_index].m(target, anchor);
				insert_dev(target, if_block_anchor, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(if_block);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(if_block_anchor);
				}

				if_blocks[current_block_type_index].d(detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_1$8.name,
			type: "if",
			source: "(103:8) {#if useNavLogoImage}",
			ctx
		});

		return block;
	}

	// (108:12) {:else}
	function create_else_block$9(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for nav logo");
				attr_dev(img, "class", "svelte-q7xgxu");
				add_location(img, file$n, 108, 16, 2516);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block$9.name,
			type: "else",
			source: "(108:12) {:else}",
			ctx
		});

		return block;
	}

	// (106:30) 
	function create_if_block_3$3(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = navLogo)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for nav logo");
				attr_dev(img, "class", "svelte-q7xgxu");
				add_location(img, file$n, 106, 16, 2427);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_3$3.name,
			type: "if",
			source: "(106:30) ",
			ctx
		});

		return block;
	}

	// (104:12) {#if navLogo && navLogo?.ext_src}
	function create_if_block_2$4(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: navLogo },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_2$4.name,
			type: "if",
			source: "(104:12) {#if navLogo && navLogo?.ext_src}",
			ctx
		});

		return block;
	}

	// (117:4) {#if showHamburger}
	function create_if_block$9(ctx) {
		let button;
		let mounted;
		let dispose;

		const block = {
			c: function create() {
				button = element("button");
				button.textContent = "☰";
				attr_dev(button, "class", "hamburger svelte-q7xgxu");
				add_location(button, file$n, 117, 8, 2758);
			},
			m: function mount(target, anchor) {
				insert_dev(target, button, anchor);

				if (!mounted) {
					dispose = listen_dev(button, "click", /*toggleMenu*/ ctx[4], false, false, false, false);
					mounted = true;
				}
			},
			p: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(button);
				}

				mounted = false;
				dispose();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$9.name,
			type: "if",
			source: "(117:4) {#if showHamburger}",
			ctx
		});

		return block;
	}

	function create_fragment$n(ctx) {
		let nav;
		let div;
		let current_block_type_index;
		let if_block0;
		let t0;
		let t1;
		let ul;
		let li0;
		let a0;
		let t3;
		let li1;
		let a1;
		let t5;
		let li2;
		let a2;
		let ul_class_value;
		let current;
		const if_block_creators = [create_if_block_1$8, create_else_block_1$4];
		const if_blocks = [];

		function select_block_type(ctx, dirty) {
			return 1;
		}

		current_block_type_index = select_block_type();
		if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
		let if_block1 = /*showHamburger*/ ctx[2] && create_if_block$9(ctx);

		const block = {
			c: function create() {
				nav = element("nav");
				div = element("div");
				if_block0.c();
				t0 = space();
				if (if_block1) if_block1.c();
				t1 = space();
				ul = element("ul");
				li0 = element("li");
				a0 = element("a");
				a0.textContent = "Find Your Home";
				t3 = space();
				li1 = element("li");
				a1 = element("a");
				a1.textContent = "Advanced Search";
				t5 = space();
				li2 = element("li");
				a2 = element("a");
				a2.textContent = "Sell Your Home";
				attr_dev(div, "class", "nav-logo svelte-q7xgxu");
				add_location(div, file$n, 101, 4, 2239);
				attr_dev(a0, "href", "#");
				attr_dev(a0, "class", "svelte-q7xgxu");
				add_location(a0, file$n, 125, 12, 3028);
				attr_dev(li0, "class", "svelte-q7xgxu");
				add_location(li0, file$n, 125, 8, 3024);
				attr_dev(a1, "href", "#");
				attr_dev(a1, "class", "svelte-q7xgxu");
				add_location(a1, file$n, 126, 12, 3076);
				attr_dev(li1, "class", "svelte-q7xgxu");
				add_location(li1, file$n, 126, 8, 3072);
				attr_dev(a2, "href", "#");
				attr_dev(a2, "class", "svelte-q7xgxu");
				add_location(a2, file$n, 127, 12, 3125);
				attr_dev(li2, "class", "svelte-q7xgxu");
				add_location(li2, file$n, 127, 8, 3121);
				attr_dev(ul, "class", ul_class_value = "" + (null_to_empty(`nav-list ${/*isMobileView*/ ctx[3] ? 'mobile' : ''} ${/*showMenu*/ ctx[1] ? 'show' : ''}`) + " svelte-q7xgxu"));
				add_location(ul, file$n, 124, 4, 2934);
				attr_dev(nav, "class", "svelte-q7xgxu");
				add_location(nav, file$n, 100, 0, 2206);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, nav, anchor);
				append_dev(nav, div);
				if_blocks[current_block_type_index].m(div, null);
				append_dev(nav, t0);
				if (if_block1) if_block1.m(nav, null);
				append_dev(nav, t1);
				append_dev(nav, ul);
				append_dev(ul, li0);
				append_dev(li0, a0);
				append_dev(ul, t3);
				append_dev(ul, li1);
				append_dev(li1, a1);
				append_dev(ul, t5);
				append_dev(ul, li2);
				append_dev(li2, a2);
				/*nav_binding*/ ctx[5](nav);
				current = true;
			},
			p: function update(ctx, [dirty]) {
				if (/*showHamburger*/ ctx[2]) {
					if (if_block1) {
						if_block1.p(ctx, dirty);
					} else {
						if_block1 = create_if_block$9(ctx);
						if_block1.c();
						if_block1.m(nav, t1);
					}
				} else if (if_block1) {
					if_block1.d(1);
					if_block1 = null;
				}

				if (!current || dirty & /*isMobileView, showMenu*/ 10 && ul_class_value !== (ul_class_value = "" + (null_to_empty(`nav-list ${/*isMobileView*/ ctx[3] ? 'mobile' : ''} ${/*showMenu*/ ctx[1] ? 'show' : ''}`) + " svelte-q7xgxu"))) {
					attr_dev(ul, "class", ul_class_value);
				}
			},
			i: function intro(local) {
				if (current) return;
				transition_in(if_block0);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block0);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(nav);
				}

				if_blocks[current_block_type_index].d();
				if (if_block1) if_block1.d();
				/*nav_binding*/ ctx[5](null);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$n.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$n($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('NavBar', slots, []);
		let navElement;
		let showMenu = false;
		let navWidth = 0;
		let showHamburger = false;
		let isMobileView = false;

		const toggleMenu = () => {
			$$invalidate(1, showMenu = !showMenu);
		};

		onMount(() => {
			const resizeObserver = new ResizeObserver(entries => {
					for (let entry of entries) {
						navWidth = entry.contentRect.width;
						updateResponsiveStyles(navWidth);
					}
				});

			if (navElement) {
				resizeObserver.observe(navElement);
			}

			return () => resizeObserver.disconnect();
		});

		const updateResponsiveStyles = width => {
			if (width < 768) {
				$$invalidate(2, showHamburger = true);
				$$invalidate(3, isMobileView = true);
			} else {
				$$invalidate(2, showHamburger = false);
				$$invalidate(3, isMobileView = false);
				$$invalidate(1, showMenu = false);
			}
		};

		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<NavBar> was created with unknown prop '${key}'`);
		});

		function nav_binding($$value) {
			binding_callbacks[$$value ? 'unshift' : 'push'](() => {
				navElement = $$value;
				$$invalidate(0, navElement);
			});
		}

		$$self.$capture_state = () => ({
			onMount,
			useNavLogoImage,
			brokerageName,
			navLogo,
			placeholderImage,
			Image,
			navElement,
			showMenu,
			navWidth,
			showHamburger,
			isMobileView,
			toggleMenu,
			updateResponsiveStyles
		});

		$$self.$inject_state = $$props => {
			if ('navElement' in $$props) $$invalidate(0, navElement = $$props.navElement);
			if ('showMenu' in $$props) $$invalidate(1, showMenu = $$props.showMenu);
			if ('navWidth' in $$props) navWidth = $$props.navWidth;
			if ('showHamburger' in $$props) $$invalidate(2, showHamburger = $$props.showHamburger);
			if ('isMobileView' in $$props) $$invalidate(3, isMobileView = $$props.isMobileView);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [navElement, showMenu, showHamburger, isMobileView, toggleMenu, nav_binding];
	}

	class NavBar extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$n, create_fragment$n, safe_not_equal, {}, add_css$l);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "NavBar",
				options,
				id: create_fragment$n.name
			});
		}
	}

	create_custom_element(NavBar, {}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/Aside.svelte generated by Svelte v4.2.18 */
	const file$m = "src/orchestraUi/DevTools/SiteDesignPreview/Aside.svelte";

	function add_css$k(target) {
		append_styles(target, "svelte-1lzn3aj", ".advertisement-images.svelte-1lzn3aj{display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:10px;justify-content:center;align-items:center;overflow-y:auto}.advertisement-images.svelte-1lzn3aj{display:grid;grid-template-columns:repeat(2, 1fr);gap:10px}.button.svelte-1lzn3aj{padding:10px 20px;border-radius:4px;border:1px solid var(--orchestra-borderColor);background-color:var(--orchestra-primary-3);color:var(--orchestra-textColor);cursor:pointer}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXNpZGUuc3ZlbHRlIiwibWFwcGluZ3MiOiJBQWFJLG9DQUFzQixDQUNsQixPQUFPLENBQUUsSUFBSSxDQUNiLHFCQUFxQixDQUFFLE9BQU8sU0FBUyxDQUFDLENBQUMsT0FBTyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUM1RCxHQUFHLENBQUUsSUFBSSxDQUNULGVBQWUsQ0FBRSxNQUFNLENBQ3ZCLFdBQVcsQ0FBRSxNQUFNLENBQ25CLFVBQVUsQ0FBRSxJQUNoQixDQUdBLG9DQUFzQixDQUNsQixPQUFPLENBQUUsSUFBSSxDQUNiLHFCQUFxQixDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQ3JDLEdBQUcsQ0FBRSxJQUNULENBRUEsc0JBQVEsQ0FDSixPQUFPLENBQUUsSUFBSSxDQUFDLElBQUksQ0FDbEIsYUFBYSxDQUFFLEdBQUcsQ0FDbEIsTUFBTSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSx1QkFBdUIsQ0FBQyxDQUM5QyxnQkFBZ0IsQ0FBRSxJQUFJLHFCQUFxQixDQUFDLENBQzVDLEtBQUssQ0FBRSxJQUFJLHFCQUFxQixDQUFDLENBQ2pDLE1BQU0sQ0FBRSxPQUNaIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbIkFzaWRlLnN2ZWx0ZSJdfQ== */");
	}

	// (47:8) {:else}
	function create_else_block_3(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for advertisement");
				add_location(img, file$m, 47, 12, 1286);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block_3.name,
			type: "else",
			source: "(47:8) {:else}",
			ctx
		});

		return block;
	}

	// (45:38) 
	function create_if_block_7(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = advertisementImage1)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for advertisement");
				add_location(img, file$m, 45, 12, 1188);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_7.name,
			type: "if",
			source: "(45:38) ",
			ctx
		});

		return block;
	}

	// (43:8) {#if advertisementImage1 && advertisementImage1?.ext_src}
	function create_if_block_6(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: advertisementImage1 },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_6.name,
			type: "if",
			source: "(43:8) {#if advertisementImage1 && advertisementImage1?.ext_src}",
			ctx
		});

		return block;
	}

	// (54:8) {:else}
	function create_else_block_2$2(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for advertisement");
				add_location(img, file$m, 54, 12, 1632);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block_2$2.name,
			type: "else",
			source: "(54:8) {:else}",
			ctx
		});

		return block;
	}

	// (52:38) 
	function create_if_block_5$2(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = advertisementImage2)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for advertisement");
				add_location(img, file$m, 52, 12, 1534);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_5$2.name,
			type: "if",
			source: "(52:38) ",
			ctx
		});

		return block;
	}

	// (50:8) {#if advertisementImage2 && advertisementImage2?.ext_src}
	function create_if_block_4$2(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: advertisementImage2 },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_4$2.name,
			type: "if",
			source: "(50:8) {#if advertisementImage2 && advertisementImage2?.ext_src}",
			ctx
		});

		return block;
	}

	// (61:8) {:else}
	function create_else_block_1$3(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for advertisement");
				add_location(img, file$m, 61, 12, 1978);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block_1$3.name,
			type: "else",
			source: "(61:8) {:else}",
			ctx
		});

		return block;
	}

	// (59:38) 
	function create_if_block_3$2(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = advertisementImage3)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for advertisement");
				add_location(img, file$m, 59, 12, 1880);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_3$2.name,
			type: "if",
			source: "(59:38) ",
			ctx
		});

		return block;
	}

	// (57:8) {#if advertisementImage3 && advertisementImage3?.ext_src}
	function create_if_block_2$3(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: advertisementImage3 },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_2$3.name,
			type: "if",
			source: "(57:8) {#if advertisementImage3 && advertisementImage3?.ext_src}",
			ctx
		});

		return block;
	}

	// (68:8) {:else}
	function create_else_block$8(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for advertisement");
				add_location(img, file$m, 68, 12, 2324);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block$8.name,
			type: "else",
			source: "(68:8) {:else}",
			ctx
		});

		return block;
	}

	// (66:38) 
	function create_if_block_1$7(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = advertisementImage4)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for advertisement");
				add_location(img, file$m, 66, 12, 2226);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_1$7.name,
			type: "if",
			source: "(66:38) ",
			ctx
		});

		return block;
	}

	// (64:8) {#if advertisementImage4 && advertisementImage4?.ext_src}
	function create_if_block$8(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: advertisementImage4 },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$8.name,
			type: "if",
			source: "(64:8) {#if advertisementImage4 && advertisementImage4?.ext_src}",
			ctx
		});

		return block;
	}

	function create_fragment$m(ctx) {
		let aside;
		let h2;
		let t1;
		let div;
		let current_block_type_index;
		let if_block0;
		let t2;
		let current_block_type_index_1;
		let if_block1;
		let t3;
		let current_block_type_index_2;
		let if_block2;
		let t4;
		let current_block_type_index_3;
		let if_block3;
		let t5;
		let p;
		let t7;
		let button;
		let current;
		const if_block_creators = [create_if_block_6, create_if_block_7, create_else_block_3];
		const if_blocks = [];

		function select_block_type(ctx, dirty) {
			if (advertisementImage1 && advertisementImage1?.ext_src) return 0;
			if (advertisementImage1) return 1;
			return 2;
		}

		current_block_type_index = select_block_type();
		if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
		const if_block_creators_1 = [create_if_block_4$2, create_if_block_5$2, create_else_block_2$2];
		const if_blocks_1 = [];

		function select_block_type_1(ctx, dirty) {
			if (advertisementImage2 && advertisementImage2?.ext_src) return 0;
			if (advertisementImage2) return 1;
			return 2;
		}

		current_block_type_index_1 = select_block_type_1();
		if_block1 = if_blocks_1[current_block_type_index_1] = if_block_creators_1[current_block_type_index_1](ctx);
		const if_block_creators_2 = [create_if_block_2$3, create_if_block_3$2, create_else_block_1$3];
		const if_blocks_2 = [];

		function select_block_type_2(ctx, dirty) {
			if (advertisementImage3 && advertisementImage3?.ext_src) return 0;
			if (advertisementImage3) return 1;
			return 2;
		}

		current_block_type_index_2 = select_block_type_2();
		if_block2 = if_blocks_2[current_block_type_index_2] = if_block_creators_2[current_block_type_index_2](ctx);
		const if_block_creators_3 = [create_if_block$8, create_if_block_1$7, create_else_block$8];
		const if_blocks_3 = [];

		function select_block_type_3(ctx, dirty) {
			if (advertisementImage4 && advertisementImage4?.ext_src) return 0;
			if (advertisementImage4) return 1;
			return 2;
		}

		current_block_type_index_3 = select_block_type_3();
		if_block3 = if_blocks_3[current_block_type_index_3] = if_block_creators_3[current_block_type_index_3](ctx);

		const block = {
			c: function create() {
				aside = element("aside");
				h2 = element("h2");
				h2.textContent = "Advertisement";
				t1 = space();
				div = element("div");
				if_block0.c();
				t2 = space();
				if_block1.c();
				t3 = space();
				if_block2.c();
				t4 = space();
				if_block3.c();
				t5 = space();
				p = element("p");
				p.textContent = "This is an aside section, often used for secondary content or advertisements.";
				t7 = space();
				button = element("button");
				button.textContent = "More Info";
				add_location(h2, file$m, 40, 4, 959);
				attr_dev(div, "class", "advertisement-images svelte-1lzn3aj");
				add_location(div, file$m, 41, 4, 986);
				add_location(p, file$m, 71, 4, 2420);
				attr_dev(button, "class", "button button-more-info svelte-1lzn3aj");
				add_location(button, file$m, 72, 4, 2509);
				attr_dev(aside, "class", "aside-content");
				add_location(aside, file$m, 39, 0, 925);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, aside, anchor);
				append_dev(aside, h2);
				append_dev(aside, t1);
				append_dev(aside, div);
				if_blocks[current_block_type_index].m(div, null);
				append_dev(div, t2);
				if_blocks_1[current_block_type_index_1].m(div, null);
				append_dev(div, t3);
				if_blocks_2[current_block_type_index_2].m(div, null);
				append_dev(div, t4);
				if_blocks_3[current_block_type_index_3].m(div, null);
				append_dev(aside, t5);
				append_dev(aside, p);
				append_dev(aside, t7);
				append_dev(aside, button);
				current = true;
			},
			p: noop$3,
			i: function intro(local) {
				if (current) return;
				transition_in(if_block0);
				transition_in(if_block1);
				transition_in(if_block2);
				transition_in(if_block3);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block0);
				transition_out(if_block1);
				transition_out(if_block2);
				transition_out(if_block3);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(aside);
				}

				if_blocks[current_block_type_index].d();
				if_blocks_1[current_block_type_index_1].d();
				if_blocks_2[current_block_type_index_2].d();
				if_blocks_3[current_block_type_index_3].d();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$m.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$m($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('Aside', slots, []);
		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Aside> was created with unknown prop '${key}'`);
		});

		$$self.$capture_state = () => ({
			placeholderImage,
			advertisementImage1,
			advertisementImage2,
			advertisementImage3,
			advertisementImage4,
			Image
		});

		return [];
	}

	class Aside extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$m, create_fragment$m, safe_not_equal, {}, add_css$k);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "Aside",
				options,
				id: create_fragment$m.name
			});
		}
	}

	create_custom_element(Aside, {}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/Article.svelte generated by Svelte v4.2.18 */
	const file$l = "src/orchestraUi/DevTools/SiteDesignPreview/Article.svelte";

	function add_css$j(target) {
		append_styles(target, "svelte-7c2rfu", ".article-content.svelte-7c2rfu.svelte-7c2rfu{display:flex;flex-wrap:wrap;gap:20px;margin-bottom:20px}.article-content.svelte-7c2rfu img.svelte-7c2rfu{flex:1;border:1px solid var(--orchestra-borderColor);border-radius:5px}.article-content-details.svelte-7c2rfu.svelte-7c2rfu{flex:2}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXJ0aWNsZS5zdmVsdGUiLCJtYXBwaW5ncyI6IkFBWUksNENBQWlCLENBQ2IsT0FBTyxDQUFFLElBQUksQ0FDYixTQUFTLENBQUUsSUFBSSxDQUNmLEdBQUcsQ0FBRSxJQUFJLENBQ1QsYUFBYSxDQUFFLElBQ25CLENBRUEsOEJBQWdCLENBQUMsaUJBQUksQ0FDakIsSUFBSSxDQUFFLENBQUMsQ0FDUCxNQUFNLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLHVCQUF1QixDQUFDLENBQzlDLGFBQWEsQ0FBRSxHQUNuQixDQUVBLG9EQUF5QixDQUNyQixJQUFJLENBQUUsQ0FDViIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJBcnRpY2xlLnN2ZWx0ZSJdfQ== */");
	}

	// (47:16) {:else}
	function create_else_block_2$1(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder Image");
				attr_dev(img, "class", "svelte-7c2rfu");
				add_location(img, file$l, 47, 20, 1419);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block_2$1.name,
			type: "else",
			source: "(47:16) {:else}",
			ctx
		});

		return block;
	}

	// (45:40) 
	function create_if_block_5$1(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = articleImage1)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Grand Opening of Local Cafe");
				attr_dev(img, "class", "svelte-7c2rfu");
				add_location(img, file$l, 45, 20, 1313);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_5$1.name,
			type: "if",
			source: "(45:40) ",
			ctx
		});

		return block;
	}

	// (43:16) {#if articleImage1 && articleImage1?.ext_src}
	function create_if_block_4$1(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: articleImage1 },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_4$1.name,
			type: "if",
			source: "(43:16) {#if articleImage1 && articleImage1?.ext_src}",
			ctx
		});

		return block;
	}

	// (70:16) {:else}
	function create_else_block_1$2(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder Image");
				attr_dev(img, "class", "svelte-7c2rfu");
				add_location(img, file$l, 70, 20, 2428);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block_1$2.name,
			type: "else",
			source: "(70:16) {:else}",
			ctx
		});

		return block;
	}

	// (68:40) 
	function create_if_block_3$1(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = articleImage2)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Boating Event");
				attr_dev(img, "class", "svelte-7c2rfu");
				add_location(img, file$l, 68, 20, 2336);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_3$1.name,
			type: "if",
			source: "(68:40) ",
			ctx
		});

		return block;
	}

	// (66:16) {#if articleImage2 && articleImage2?.ext_src}
	function create_if_block_2$2(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: articleImage2 },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_2$2.name,
			type: "if",
			source: "(66:16) {#if articleImage2 && articleImage2?.ext_src}",
			ctx
		});

		return block;
	}

	// (93:16) {:else}
	function create_else_block$7(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder Image");
				attr_dev(img, "class", "svelte-7c2rfu");
				add_location(img, file$l, 93, 20, 3426);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block$7.name,
			type: "else",
			source: "(93:16) {:else}",
			ctx
		});

		return block;
	}

	// (91:40) 
	function create_if_block_1$6(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = articleImage3)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder Image");
				attr_dev(img, "class", "svelte-7c2rfu");
				add_location(img, file$l, 91, 20, 3330);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_1$6.name,
			type: "if",
			source: "(91:40) ",
			ctx
		});

		return block;
	}

	// (89:16) {#if articleImage3 && articleImage3?.ext_src}
	function create_if_block$7(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: articleImage3 },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$7.name,
			type: "if",
			source: "(89:16) {#if articleImage3 && articleImage3?.ext_src}",
			ctx
		});

		return block;
	}

	function create_fragment$l(ctx) {
		let section;
		let article;
		let h1;
		let t1;
		let p0;
		let t3;
		let h20;
		let t5;
		let h30;
		let t7;
		let div2;
		let div0;
		let current_block_type_index;
		let if_block0;
		let t8;
		let div1;
		let p1;
		let t10;
		let ul0;
		let li0;
		let t12;
		let li1;
		let t14;
		let li2;
		let t16;
		let li3;
		let t18;
		let p2;
		let a0;
		let t20;
		let h31;
		let t22;
		let div5;
		let div3;
		let current_block_type_index_1;
		let if_block1;
		let t23;
		let div4;
		let p3;
		let t25;
		let ol;
		let li4;
		let t27;
		let li5;
		let t29;
		let li6;
		let t31;
		let li7;
		let t33;
		let p4;
		let a1;
		let t35;
		let h21;
		let t37;
		let div8;
		let div6;
		let current_block_type_index_2;
		let if_block2;
		let t38;
		let div7;
		let p5;
		let t40;
		let ul1;
		let li8;
		let t42;
		let li9;
		let t44;
		let li10;
		let t46;
		let h22;
		let t48;
		let p6;
		let t49;
		let a2;
		let t51;
		let t52;
		let h4;
		let t54;
		let p7;
		let t55;
		let a3;
		let t57;
		let a4;
		let t59;
		let current;
		const if_block_creators = [create_if_block_4$1, create_if_block_5$1, create_else_block_2$1];
		const if_blocks = [];

		function select_block_type(ctx, dirty) {
			if (articleImage1 && articleImage1?.ext_src) return 0;
			if (articleImage1) return 1;
			return 2;
		}

		current_block_type_index = select_block_type();
		if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
		const if_block_creators_1 = [create_if_block_2$2, create_if_block_3$1, create_else_block_1$2];
		const if_blocks_1 = [];

		function select_block_type_1(ctx, dirty) {
			if (articleImage2 && articleImage2?.ext_src) return 0;
			if (articleImage2) return 1;
			return 2;
		}

		current_block_type_index_1 = select_block_type_1();
		if_block1 = if_blocks_1[current_block_type_index_1] = if_block_creators_1[current_block_type_index_1](ctx);
		const if_block_creators_2 = [create_if_block$7, create_if_block_1$6, create_else_block$7];
		const if_blocks_2 = [];

		function select_block_type_2(ctx, dirty) {
			if (articleImage3 && articleImage3?.ext_src) return 0;
			if (articleImage3) return 1;
			return 2;
		}

		current_block_type_index_2 = select_block_type_2();
		if_block2 = if_blocks_2[current_block_type_index_2] = if_block_creators_2[current_block_type_index_2](ctx);

		const block = {
			c: function create() {
				section = element("section");
				article = element("article");
				h1 = element("h1");
				h1.textContent = "Local Real Estate Market Update";
				t1 = space();
				p0 = element("p");
				p0.textContent = "The local real estate market is experiencing a period of growth, with an increasing number of properties available for sale. This is an exciting time for both buyers and sellers. Here are some of the most interesting properties currently on the market:";
				t3 = space();
				h20 = element("h2");
				h20.textContent = "Local Events";
				t5 = space();
				h30 = element("h3");
				h30.textContent = "Grand Opening of Local Cafe";
				t7 = space();
				div2 = element("div");
				div0 = element("div");
				if_block0.c();
				t8 = space();
				div1 = element("div");
				p1 = element("p");
				p1.textContent = "Join us for the grand opening of a new cafe in the heart of downtown. Enjoy delicious coffee, pastries, and a welcoming atmosphere.";
				t10 = space();
				ul0 = element("ul");
				li0 = element("li");
				li0.textContent = "Live music performances";
				t12 = space();
				li1 = element("li");
				li1.textContent = "Special opening discounts";
				t14 = space();
				li2 = element("li");
				li2.textContent = "Free coffee samples";
				t16 = space();
				li3 = element("li");
				li3.textContent = "Meet the owners";
				t18 = space();
				p2 = element("p");
				a0 = element("a");
				a0.textContent = "View more details about this event";
				t20 = space();
				h31 = element("h3");
				h31.textContent = "Boating Event";
				t22 = space();
				div5 = element("div");
				div3 = element("div");
				if_block1.c();
				t23 = space();
				div4 = element("div");
				p3 = element("p");
				p3.textContent = "Gather with friends and family to watch the annual boating event at the local marina. Enjoy food, drinks, and a beautiful view.";
				t25 = space();
				ol = element("ol");
				li4 = element("li");
				li4.textContent = "Boat parade";
				t27 = space();
				li5 = element("li");
				li5.textContent = "Live commentary";
				t29 = space();
				li6 = element("li");
				li6.textContent = "Food stalls";
				t31 = space();
				li7 = element("li");
				li7.textContent = "Family-friendly activities";
				t33 = space();
				p4 = element("p");
				a1 = element("a");
				a1.textContent = "View more details about this event";
				t35 = space();
				h21 = element("h2");
				h21.textContent = "Market Trends";
				t37 = space();
				div8 = element("div");
				div6 = element("div");
				if_block2.c();
				t38 = space();
				div7 = element("div");
				p5 = element("p");
				p5.textContent = "The current market trends indicate a rise in property values, making it a great time to invest in real estate. Some key trends include:";
				t40 = space();
				ul1 = element("ul");
				li8 = element("li");
				li8.textContent = "Increased demand for suburban homes";
				t42 = space();
				li9 = element("li");
				li9.textContent = "Rising interest in properties with home office spaces";
				t44 = space();
				li10 = element("li");
				li10.textContent = "Growth in the luxury condo market";
				t46 = space();
				h22 = element("h2");
				h22.textContent = "Conclusion";
				t48 = space();
				p6 = element("p");
				t49 = text("Whether you're looking to buy or sell, the local real estate market offers numerous opportunities. For more information and to schedule a viewing, please ");
				a2 = element("a");
				a2.textContent = "contact us";
				t51 = text(".");
				t52 = space();
				h4 = element("h4");
				h4.textContent = "Contact Information";
				t54 = space();
				p7 = element("p");
				t55 = text("For any inquiries, please reach out to our office at ");
				a3 = element("a");
				a3.textContent = "(123) 456-7890";
				t57 = text(" or email us at ");
				a4 = element("a");
				a4.textContent = "brendan@sladekrealty.com";
				t59 = text(".");
				add_location(h1, file$l, 34, 8, 688);
				add_location(p0, file$l, 35, 8, 737);
				add_location(h20, file$l, 37, 8, 1014);
				add_location(h30, file$l, 39, 8, 1045);
				add_location(div0, file$l, 41, 12, 1132);
				add_location(p1, file$l, 51, 16, 1581);
				add_location(li0, file$l, 53, 20, 1761);
				add_location(li1, file$l, 54, 20, 1814);
				add_location(li2, file$l, 55, 20, 1869);
				add_location(li3, file$l, 56, 20, 1918);
				add_location(ul0, file$l, 52, 16, 1736);
				attr_dev(a0, "href", "#");
				add_location(a0, file$l, 58, 19, 1984);
				add_location(p2, file$l, 58, 16, 1981);
				attr_dev(div1, "class", "article-content-details svelte-7c2rfu");
				add_location(div1, file$l, 50, 12, 1527);
				attr_dev(div2, "class", "article-content svelte-7c2rfu");
				add_location(div2, file$l, 40, 8, 1090);
				add_location(h31, file$l, 62, 8, 2082);
				add_location(div3, file$l, 64, 12, 2155);
				add_location(p3, file$l, 74, 16, 2590);
				add_location(li4, file$l, 76, 20, 2766);
				add_location(li5, file$l, 77, 20, 2807);
				add_location(li6, file$l, 78, 20, 2852);
				add_location(li7, file$l, 79, 20, 2893);
				add_location(ol, file$l, 75, 16, 2741);
				attr_dev(a1, "href", "#");
				add_location(a1, file$l, 81, 19, 2970);
				add_location(p4, file$l, 81, 16, 2967);
				attr_dev(div4, "class", "article-content-details svelte-7c2rfu");
				add_location(div4, file$l, 73, 12, 2536);
				attr_dev(div5, "class", "article-content svelte-7c2rfu");
				add_location(div5, file$l, 63, 8, 2113);
				add_location(h21, file$l, 85, 8, 3076);
				add_location(div6, file$l, 87, 12, 3149);
				add_location(p5, file$l, 97, 16, 3588);
				add_location(li8, file$l, 99, 20, 3772);
				add_location(li9, file$l, 100, 20, 3837);
				add_location(li10, file$l, 101, 20, 3920);
				add_location(ul1, file$l, 98, 16, 3747);
				attr_dev(div7, "class", "article-content-details svelte-7c2rfu");
				add_location(div7, file$l, 96, 12, 3534);
				attr_dev(div8, "class", "article-content svelte-7c2rfu");
				add_location(div8, file$l, 86, 8, 3107);
				add_location(h22, file$l, 106, 8, 4028);
				attr_dev(a2, "href", "#");
				add_location(a2, file$l, 107, 165, 4213);
				add_location(p6, file$l, 107, 8, 4056);
				add_location(h4, file$l, 109, 8, 4254);
				attr_dev(a3, "href", "tel:+1234567890");
				add_location(a3, file$l, 110, 64, 4347);
				attr_dev(a4, "href", "mailto:brendan@sladekrealty.com");
				add_location(a4, file$l, 110, 124, 4407);
				add_location(p7, file$l, 110, 8, 4291);
				add_location(article, file$l, 33, 4, 670);
				attr_dev(section, "class", "section");
				add_location(section, file$l, 32, 0, 640);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, section, anchor);
				append_dev(section, article);
				append_dev(article, h1);
				append_dev(article, t1);
				append_dev(article, p0);
				append_dev(article, t3);
				append_dev(article, h20);
				append_dev(article, t5);
				append_dev(article, h30);
				append_dev(article, t7);
				append_dev(article, div2);
				append_dev(div2, div0);
				if_blocks[current_block_type_index].m(div0, null);
				append_dev(div2, t8);
				append_dev(div2, div1);
				append_dev(div1, p1);
				append_dev(div1, t10);
				append_dev(div1, ul0);
				append_dev(ul0, li0);
				append_dev(ul0, t12);
				append_dev(ul0, li1);
				append_dev(ul0, t14);
				append_dev(ul0, li2);
				append_dev(ul0, t16);
				append_dev(ul0, li3);
				append_dev(div1, t18);
				append_dev(div1, p2);
				append_dev(p2, a0);
				append_dev(article, t20);
				append_dev(article, h31);
				append_dev(article, t22);
				append_dev(article, div5);
				append_dev(div5, div3);
				if_blocks_1[current_block_type_index_1].m(div3, null);
				append_dev(div5, t23);
				append_dev(div5, div4);
				append_dev(div4, p3);
				append_dev(div4, t25);
				append_dev(div4, ol);
				append_dev(ol, li4);
				append_dev(ol, t27);
				append_dev(ol, li5);
				append_dev(ol, t29);
				append_dev(ol, li6);
				append_dev(ol, t31);
				append_dev(ol, li7);
				append_dev(div4, t33);
				append_dev(div4, p4);
				append_dev(p4, a1);
				append_dev(article, t35);
				append_dev(article, h21);
				append_dev(article, t37);
				append_dev(article, div8);
				append_dev(div8, div6);
				if_blocks_2[current_block_type_index_2].m(div6, null);
				append_dev(div8, t38);
				append_dev(div8, div7);
				append_dev(div7, p5);
				append_dev(div7, t40);
				append_dev(div7, ul1);
				append_dev(ul1, li8);
				append_dev(ul1, t42);
				append_dev(ul1, li9);
				append_dev(ul1, t44);
				append_dev(ul1, li10);
				append_dev(article, t46);
				append_dev(article, h22);
				append_dev(article, t48);
				append_dev(article, p6);
				append_dev(p6, t49);
				append_dev(p6, a2);
				append_dev(p6, t51);
				append_dev(article, t52);
				append_dev(article, h4);
				append_dev(article, t54);
				append_dev(article, p7);
				append_dev(p7, t55);
				append_dev(p7, a3);
				append_dev(p7, t57);
				append_dev(p7, a4);
				append_dev(p7, t59);
				current = true;
			},
			p: noop$3,
			i: function intro(local) {
				if (current) return;
				transition_in(if_block0);
				transition_in(if_block1);
				transition_in(if_block2);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block0);
				transition_out(if_block1);
				transition_out(if_block2);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(section);
				}

				if_blocks[current_block_type_index].d();
				if_blocks_1[current_block_type_index_1].d();
				if_blocks_2[current_block_type_index_2].d();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$l.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$l($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('Article', slots, []);
		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Article> was created with unknown prop '${key}'`);
		});

		$$self.$capture_state = () => ({
			placeholderImage,
			articleImage1,
			articleImage2,
			articleImage3,
			Image
		});

		return [];
	}

	class Article extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$l, create_fragment$l, safe_not_equal, {}, add_css$j);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "Article",
				options,
				id: create_fragment$l.name
			});
		}
	}

	create_custom_element(Article, {}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/Footer.svelte generated by Svelte v4.2.18 */
	const file$k = "src/orchestraUi/DevTools/SiteDesignPreview/Footer.svelte";

	function add_css$i(target) {
		append_styles(target, "svelte-1jqk9rp", "footer.svelte-1jqk9rp.svelte-1jqk9rp{display:flex;flex-direction:column;padding:20px;text-align:left;background-color:var(--orchestra-footerBackgroundColor, #f1f1f1);color:var(--orchestra-footerTextColor, #333)}.footer-content.svelte-1jqk9rp.svelte-1jqk9rp{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;padding:20px;background-color:var(--orchestra-cardBackground-4);border-radius:8px}.brokerage-section.svelte-1jqk9rp.svelte-1jqk9rp,.contact-us-section.svelte-1jqk9rp.svelte-1jqk9rp{border-radius:4px;margin:20px}.brokerage-section.svelte-1jqk9rp.svelte-1jqk9rp{width:100%}.contact-us-section.svelte-1jqk9rp.svelte-1jqk9rp{width:100%;max-width:600px}.contact-us-section.svelte-1jqk9rp form.svelte-1jqk9rp{display:grid;grid-template-columns:1fr;gap:10px}.contact-us-action.svelte-1jqk9rp.svelte-1jqk9rp{display:flex;margin:10px}.brokerage-logo-container.svelte-1jqk9rp.svelte-1jqk9rp{display:flex;justify-content:center;width:100%}.brokerage-logo-container.svelte-1jqk9rp img.svelte-1jqk9rp{max-width:50%;border-radius:50%}.brokerage-name.svelte-1jqk9rp.svelte-1jqk9rp{width:100%;text-align:center}.brokerage-name.svelte-1jqk9rp h1.svelte-1jqk9rp{margin:0;padding:20px}.brokerage-description.svelte-1jqk9rp.svelte-1jqk9rp{width:100%;text-align:left}.contact-buttons-container.svelte-1jqk9rp.svelte-1jqk9rp{display:flex;gap:10px;justify-content:space-evenly;padding:20px 0}.copyright-container.svelte-1jqk9rp.svelte-1jqk9rp{width:100%;text-align:center}.button-contact-agent.svelte-1jqk9rp.svelte-1jqk9rp,.button-contact-brokerage.svelte-1jqk9rp.svelte-1jqk9rp,.button-contact-site-owner.svelte-1jqk9rp.svelte-1jqk9rp{padding:20px;background-color:var(--orchestra-secondary-3);color:var(--orchestra-textColor)\n    }.button-contact-site-owner.svelte-1jqk9rp.svelte-1jqk9rp{background-color:var(--orchestra-primary-3)}button.svelte-1jqk9rp.svelte-1jqk9rp{width:100%}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRm9vdGVyLnN2ZWx0ZSIsIm1hcHBpbmdzIjoiQUFNSSxvQ0FBTyxDQUNILE9BQU8sQ0FBRSxJQUFJLENBQ2IsY0FBYyxDQUFFLE1BQU0sQ0FDdEIsT0FBTyxDQUFFLElBQUksQ0FDYixVQUFVLENBQUUsSUFBSSxDQUNoQixnQkFBZ0IsQ0FBRSxJQUFJLGlDQUFpQyxDQUFDLFFBQVEsQ0FBQyxDQUNqRSxLQUFLLENBQUUsSUFBSSwyQkFBMkIsQ0FBQyxLQUFLLENBQ2hELENBRUEsNkNBQWdCLENBQ1osT0FBTyxDQUFFLElBQUksQ0FDYixTQUFTLENBQUUsSUFBSSxDQUNmLGVBQWUsQ0FBRSxNQUFNLENBQ3ZCLFdBQVcsQ0FBRSxNQUFNLENBQ25CLE9BQU8sQ0FBRSxJQUFJLENBQ2IsZ0JBQWdCLENBQUUsSUFBSSw0QkFBNEIsQ0FBQyxDQUNuRCxhQUFhLENBQUUsR0FDbkIsQ0FFQSxnREFBa0IsQ0FBRSxpREFBb0IsQ0FDcEMsYUFBYSxDQUFFLEdBQUcsQ0FDbEIsTUFBTSxDQUFFLElBQ1osQ0FFQSxnREFBbUIsQ0FDZixLQUFLLENBQUUsSUFDWCxDQUVBLGlEQUFvQixDQUNoQixLQUFLLENBQUUsSUFBSSxDQUNYLFNBQVMsQ0FBRSxLQUNmLENBR0Esa0NBQW1CLENBQUMsbUJBQUssQ0FDckIsT0FBTyxDQUFFLElBQUksQ0FDYixxQkFBcUIsQ0FBRSxHQUFHLENBQzFCLEdBQUcsQ0FBRSxJQUNULENBRUEsZ0RBQW1CLENBQ2YsT0FBTyxDQUFFLElBQUksQ0FDYixNQUFNLENBQUUsSUFHWixDQUVBLHVEQUEwQixDQUN0QixPQUFPLENBQUUsSUFBSSxDQUNiLGVBQWUsQ0FBRSxNQUFNLENBQ3ZCLEtBQUssQ0FBRSxJQUNYLENBRUEsd0NBQXlCLENBQUMsa0JBQUksQ0FDMUIsU0FBUyxDQUFFLEdBQUcsQ0FDZCxhQUFhLENBQUUsR0FDbkIsQ0FFQSw2Q0FBZ0IsQ0FDWixLQUFLLENBQUUsSUFBSSxDQUNYLFVBQVUsQ0FBRSxNQUNoQixDQUVBLDhCQUFlLENBQUMsaUJBQUcsQ0FDZixNQUFNLENBQUUsQ0FBQyxDQUNULE9BQU8sQ0FBRSxJQUNiLENBRUEsb0RBQXVCLENBQ25CLEtBQUssQ0FBRSxJQUFJLENBQ1gsVUFBVSxDQUFFLElBQ2hCLENBRUEsd0RBQTJCLENBQ3ZCLE9BQU8sQ0FBRSxJQUFJLENBQ2IsR0FBRyxDQUFFLElBQUksQ0FDVCxlQUFlLENBQUUsWUFBWSxDQUM3QixPQUFPLENBQUUsSUFBSSxDQUFDLENBQ2xCLENBRUEsa0RBQXFCLENBQ2pCLEtBQUssQ0FBRSxJQUFJLENBQ1gsVUFBVSxDQUFFLE1BQ2hCLENBRUEsbURBQXFCLENBQUUsdURBQXlCLENBQUUsd0RBQTJCLENBQ3pFLE9BQU8sQ0FBRSxJQUFJLENBQ2IsZ0JBQWdCLENBQUUsSUFBSSx1QkFBdUIsQ0FBQyxDQUM5QyxLQUFLLENBQUUsSUFBSSxxQkFBcUI7QUFDeEMsSUFBSSxDQUVBLHdEQUEyQixDQUN2QixnQkFBZ0IsQ0FBRSxJQUFJLHFCQUFxQixDQUUvQyxDQUVBLG9DQUFPLENBQ0gsS0FBSyxDQUFFLElBQ1giLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiRm9vdGVyLnN2ZWx0ZSJdfQ== */");
	}

	// (120:16) {:else}
	function create_else_block$6(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder Image");
				attr_dev(img, "class", "svelte-1jqk9rp");
				add_location(img, file$k, 120, 20, 2858);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block$6.name,
			type: "else",
			source: "(120:16) {:else}",
			ctx
		});

		return block;
	}

	// (118:41) 
	function create_if_block_1$5(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = brokerageImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder Image");
				attr_dev(img, "class", "svelte-1jqk9rp");
				add_location(img, file$k, 118, 20, 2761);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_1$5.name,
			type: "if",
			source: "(118:41) ",
			ctx
		});

		return block;
	}

	// (116:16) {#if brokerageImage && brokerageImage?.ext_src}
	function create_if_block$6(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: brokerageImage },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$6.name,
			type: "if",
			source: "(116:16) {#if brokerageImage && brokerageImage?.ext_src}",
			ctx
		});

		return block;
	}

	function create_fragment$k(ctx) {
		let footer;
		let h20;
		let t1;
		let div8;
		let section0;
		let div0;
		let current_block_type_index;
		let if_block;
		let t2;
		let div1;
		let h1;
		let t4;
		let div2;
		let h21;
		let t6;
		let p0;
		let t8;
		let p1;
		let t10;
		let p2;
		let t12;
		let div5;
		let div3;
		let button0;
		let t14;
		let div4;
		let button1;
		let t16;
		let section1;
		let h22;
		let t18;
		let form;
		let label0;
		let t20;
		let input0;
		let t21;
		let label1;
		let t23;
		let input1;
		let t24;
		let label2;
		let t26;
		let textarea;
		let t27;
		let label3;
		let t29;
		let select;
		let option0;
		let option1;
		let option2;
		let option3;
		let option4;
		let t35;
		let div6;
		let button2;
		let t37;
		let div7;
		let p3;
		let current;
		let mounted;
		let dispose;
		const if_block_creators = [create_if_block$6, create_if_block_1$5, create_else_block$6];
		const if_blocks = [];

		function select_block_type(ctx, dirty) {
			if (brokerageImage && brokerageImage?.ext_src) return 0;
			if (brokerageImage) return 1;
			return 2;
		}

		current_block_type_index = select_block_type();
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

		const block = {
			c: function create() {
				footer = element("footer");
				h20 = element("h2");
				h20.textContent = "Footer Section";
				t1 = space();
				div8 = element("div");
				section0 = element("section");
				div0 = element("div");
				if_block.c();
				t2 = space();
				div1 = element("div");
				h1 = element("h1");
				h1.textContent = `${brokerageName}`;
				t4 = space();
				div2 = element("div");
				h21 = element("h2");
				h21.textContent = "About Sladek Realty";
				t6 = space();
				p0 = element("p");
				p0.textContent = "Sladek Realty is a full-service real estate brokerage proudly serving the great state of Texas. With years of experience and a deep understanding of the Texas market, our dedicated team is committed to helping clients find their dream homes, investment properties, and commercial spaces.";
				t8 = space();
				p1 = element("p");
				p1.textContent = "From first-time buyers to seasoned investors, Sladek Realty provides personalized guidance every step of the way. Our extensive knowledge of local communities and unparalleled commitment to customer satisfaction makes us a trusted partner in all things real estate.";
				t10 = space();
				p2 = element("p");
				p2.textContent = "Let Sladek Realty make your next move seamless and stress-free.";
				t12 = space();
				div5 = element("div");
				div3 = element("div");
				button0 = element("button");
				button0.textContent = "Contact Agent";
				t14 = space();
				div4 = element("div");
				button1 = element("button");
				button1.textContent = "Contact Brokerage";
				t16 = space();
				section1 = element("section");
				h22 = element("h2");
				h22.textContent = "Contact Us";
				t18 = space();
				form = element("form");
				label0 = element("label");
				label0.textContent = "Name:";
				t20 = space();
				input0 = element("input");
				t21 = space();
				label1 = element("label");
				label1.textContent = "Email:";
				t23 = space();
				input1 = element("input");
				t24 = space();
				label2 = element("label");
				label2.textContent = "Message:";
				t26 = space();
				textarea = element("textarea");
				t27 = space();
				label3 = element("label");
				label3.textContent = "Property Type:";
				t29 = space();
				select = element("select");
				option0 = element("option");
				option0.textContent = "Single Family";
				option1 = element("option");
				option1.textContent = "Condo";
				option2 = element("option");
				option2.textContent = "Townhouse";
				option3 = element("option");
				option3.textContent = "Multi Family";
				option4 = element("option");
				option4.textContent = "Vacant Land";
				t35 = space();
				div6 = element("div");
				button2 = element("button");
				button2.textContent = "Contact Us";
				t37 = space();
				div7 = element("div");
				p3 = element("p");
				p3.textContent = "© 2024 Sladek Realty. All rights reserved.";
				add_location(h20, file$k, 111, 4, 2422);
				attr_dev(div0, "class", "brokerage-logo-container svelte-1jqk9rp");
				add_location(div0, file$k, 114, 12, 2543);
				attr_dev(h1, "class", "svelte-1jqk9rp");
				add_location(h1, file$k, 124, 16, 3011);
				attr_dev(div1, "class", "brokerage-name svelte-1jqk9rp");
				add_location(div1, file$k, 123, 12, 2966);
				add_location(h21, file$k, 127, 16, 3119);
				add_location(p0, file$k, 128, 16, 3164);
				add_location(p1, file$k, 131, 16, 3514);
				add_location(p2, file$k, 134, 16, 3842);
				attr_dev(div2, "class", "brokerage-description svelte-1jqk9rp");
				add_location(div2, file$k, 126, 12, 3067);
				attr_dev(button0, "class", "svelte-1jqk9rp");
				add_location(button0, file$k, 140, 20, 4139);
				attr_dev(div3, "class", "button-contact-agent button-wrapper svelte-1jqk9rp");
				add_location(div3, file$k, 139, 16, 4038);
				attr_dev(button1, "class", "svelte-1jqk9rp");
				add_location(button1, file$k, 143, 20, 4314);
				attr_dev(div4, "class", "button-contact-brokerage button-wrapper svelte-1jqk9rp");
				add_location(div4, file$k, 142, 16, 4209);
				attr_dev(div5, "class", "contact-buttons-container svelte-1jqk9rp");
				add_location(div5, file$k, 138, 12, 3982);
				attr_dev(section0, "class", "section brokerage-section svelte-1jqk9rp");
				add_location(section0, file$k, 113, 8, 2487);
				add_location(h22, file$k, 149, 12, 4476);
				attr_dev(label0, "for", "name");
				add_location(label0, file$k, 151, 16, 4531);
				attr_dev(input0, "type", "text");
				attr_dev(input0, "id", "name");
				attr_dev(input0, "name", "name");
				add_location(input0, file$k, 152, 16, 4579);
				attr_dev(label1, "for", "email");
				add_location(label1, file$k, 153, 16, 4637);
				attr_dev(input1, "type", "email");
				attr_dev(input1, "id", "email");
				attr_dev(input1, "name", "email");
				add_location(input1, file$k, 154, 16, 4687);
				attr_dev(label2, "for", "message");
				add_location(label2, file$k, 155, 16, 4748);
				attr_dev(textarea, "id", "message");
				attr_dev(textarea, "name", "message");
				add_location(textarea, file$k, 156, 16, 4802);
				attr_dev(label3, "for", "propertyType");
				add_location(label3, file$k, 157, 16, 4868);
				option0.__value = "single-family";
				set_input_value(option0, option0.__value);
				add_location(option0, file$k, 159, 20, 5000);
				option1.__value = "condo";
				set_input_value(option1, option1.__value);
				add_location(option1, file$k, 160, 20, 5073);
				option2.__value = "townhouse";
				set_input_value(option2, option2.__value);
				add_location(option2, file$k, 161, 20, 5130);
				option3.__value = "multi-family";
				set_input_value(option3, option3.__value);
				add_location(option3, file$k, 162, 20, 5195);
				option4.__value = "vacant-land";
				set_input_value(option4, option4.__value);
				add_location(option4, file$k, 163, 20, 5266);
				attr_dev(select, "id", "propertyType");
				attr_dev(select, "name", "propertyType");
				add_location(select, file$k, 158, 16, 4933);
				attr_dev(button2, "class", "button-contact-site-owner svelte-1jqk9rp");
				add_location(button2, file$k, 166, 20, 5409);
				attr_dev(div6, "class", "contact-us-action svelte-1jqk9rp");
				add_location(div6, file$k, 165, 16, 5357);
				attr_dev(form, "class", "svelte-1jqk9rp");
				add_location(form, file$k, 150, 12, 4508);
				attr_dev(section1, "class", "section contact-us-section svelte-1jqk9rp");
				add_location(section1, file$k, 148, 8, 4419);
				add_location(p3, file$k, 171, 12, 5587);
				attr_dev(div7, "class", "copyright-container svelte-1jqk9rp");
				add_location(div7, file$k, 170, 8, 5541);
				attr_dev(div8, "class", "footer-content svelte-1jqk9rp");
				add_location(div8, file$k, 112, 4, 2450);
				attr_dev(footer, "class", "svelte-1jqk9rp");
				add_location(footer, file$k, 110, 0, 2409);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, footer, anchor);
				append_dev(footer, h20);
				append_dev(footer, t1);
				append_dev(footer, div8);
				append_dev(div8, section0);
				append_dev(section0, div0);
				if_blocks[current_block_type_index].m(div0, null);
				append_dev(section0, t2);
				append_dev(section0, div1);
				append_dev(div1, h1);
				append_dev(section0, t4);
				append_dev(section0, div2);
				append_dev(div2, h21);
				append_dev(div2, t6);
				append_dev(div2, p0);
				append_dev(div2, t8);
				append_dev(div2, p1);
				append_dev(div2, t10);
				append_dev(div2, p2);
				append_dev(section0, t12);
				append_dev(section0, div5);
				append_dev(div5, div3);
				append_dev(div3, button0);
				append_dev(div5, t14);
				append_dev(div5, div4);
				append_dev(div4, button1);
				append_dev(div8, t16);
				append_dev(div8, section1);
				append_dev(section1, h22);
				append_dev(section1, t18);
				append_dev(section1, form);
				append_dev(form, label0);
				append_dev(form, t20);
				append_dev(form, input0);
				append_dev(form, t21);
				append_dev(form, label1);
				append_dev(form, t23);
				append_dev(form, input1);
				append_dev(form, t24);
				append_dev(form, label2);
				append_dev(form, t26);
				append_dev(form, textarea);
				append_dev(form, t27);
				append_dev(form, label3);
				append_dev(form, t29);
				append_dev(form, select);
				append_dev(select, option0);
				append_dev(select, option1);
				append_dev(select, option2);
				append_dev(select, option3);
				append_dev(select, option4);
				append_dev(form, t35);
				append_dev(form, div6);
				append_dev(div6, button2);
				append_dev(div8, t37);
				append_dev(div8, div7);
				append_dev(div7, p3);
				current = true;

				if (!mounted) {
					dispose = [
						listen_dev(div3, "click", /*click_handler*/ ctx[0], false, false, false, false),
						listen_dev(div4, "click", /*click_handler_1*/ ctx[1], false, false, false, false)
					];

					mounted = true;
				}
			},
			p: noop$3,
			i: function intro(local) {
				if (current) return;
				transition_in(if_block);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(footer);
				}

				if_blocks[current_block_type_index].d();
				mounted = false;
				run_all(dispose);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$k.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$k($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('Footer', slots, []);
		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Footer> was created with unknown prop '${key}'`);
		});

		const click_handler = () => togglePopup();
		const click_handler_1 = () => togglePopup();

		$$self.$capture_state = () => ({
			placeholderImage,
			brokerageName,
			brokerageImage,
			togglePopup,
			Image
		});

		return [click_handler, click_handler_1];
	}

	class Footer extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$k, create_fragment$k, safe_not_equal, {}, add_css$i);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "Footer",
				options,
				id: create_fragment$k.name
			});
		}
	}

	create_custom_element(Footer, {}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/Section/SectionHero.svelte generated by Svelte v4.2.18 */
	const file$j = "src/orchestraUi/DevTools/SiteDesignPreview/Section/SectionHero.svelte";

	function add_css$h(target) {
		append_styles(target, "svelte-ilr7d", ".button.svelte-ilr7d{padding:10px 20px;border-radius:4px;border:1px solid var(--orchestra-borderColor);background-color:var(--orchestra-primary-3);color:var(--orchestra-textColor);cursor:pointer}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VjdGlvbkhlcm8uc3ZlbHRlIiwibWFwcGluZ3MiOiJBQVVJLG9CQUFRLENBQ0osT0FBTyxDQUFFLElBQUksQ0FBQyxJQUFJLENBQ2xCLGFBQWEsQ0FBRSxHQUFHLENBQ2xCLE1BQU0sQ0FBRSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksdUJBQXVCLENBQUMsQ0FDOUMsZ0JBQWdCLENBQUUsSUFBSSxxQkFBcUIsQ0FBQyxDQUM1QyxLQUFLLENBQUUsSUFBSSxxQkFBcUIsQ0FBQyxDQUNqQyxNQUFNLENBQUUsT0FDWiIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJTZWN0aW9uSGVyby5zdmVsdGUiXX0= */");
	}

	function create_fragment$j(ctx) {
		let section;
		let t0;
		let div;
		let input;
		let t1;
		let button;
		let fontawesomeicon;
		let t2;
		let i;
		let current;
		let if_block = showHeroImage ;

		fontawesomeicon = new FontAwesomeIcon({
				props: { icon: faSearchLocation },
				$$inline: true
			});

		const block = {
			c: function create() {
				section = element("section");
				t0 = space();
				div = element("div");
				input = element("input");
				t1 = space();
				button = element("button");
				create_component(fontawesomeicon.$$.fragment);
				t2 = space();
				i = element("i");
				attr_dev(input, "type", "text");
				attr_dev(input, "placeholder", "County, City, Postal, Street...");
				add_location(input, file$j, 35, 8, 1237);
				attr_dev(i, "class", "fa fa-search");
				add_location(i, file$j, 38, 12, 1417);
				attr_dev(button, "class", "button button-search svelte-ilr7d");
				add_location(button, file$j, 36, 8, 1311);
				attr_dev(div, "class", "hero-search");
				add_location(div, file$j, 34, 4, 1203);
				attr_dev(section, "class", "hero");
				set_style(section, "background-image", "url(" + (heroBackgroundImage || placeholderImage) + ")");
				add_location(section, file$j, 26, 0, 903);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, section, anchor);
				append_dev(section, t0);
				append_dev(section, div);
				append_dev(div, input);
				append_dev(div, t1);
				append_dev(div, button);
				mount_component(fontawesomeicon, button, null);
				append_dev(button, t2);
				append_dev(button, i);
				current = true;
			},
			p: noop$3,
			i: function intro(local) {
				if (current) return;
				transition_in(if_block);
				transition_in(fontawesomeicon.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block);
				transition_out(fontawesomeicon.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(section);
				}
				destroy_component(fontawesomeicon);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$j.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$j($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('SectionHero', slots, []);
		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<SectionHero> was created with unknown prop '${key}'`);
		});

		$$self.$capture_state = () => ({
			faSearchLocation,
			FontAwesomeIcon,
			showHeroImage,
			heroImage,
			heroBackgroundImage,
			placeholderImage,
			Image
		});

		return [];
	}

	class SectionHero extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$j, create_fragment$j, safe_not_equal, {}, add_css$h);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "SectionHero",
				options,
				id: create_fragment$j.name
			});
		}
	}

	create_custom_element(SectionHero, {}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/Section/SectionFeaturedAreas.svelte generated by Svelte v4.2.18 */
	const file$i = "src/orchestraUi/DevTools/SiteDesignPreview/Section/SectionFeaturedAreas.svelte";

	function add_css$g(target) {
		append_styles(target, "svelte-mwgvqh", ".featured-areas.svelte-mwgvqh.svelte-mwgvqh{display:grid;grid-template-columns:repeat(auto-fit, minmax(350px, 1fr));max-width:1200px;gap:8px;justify-content:center;align-items:center;overflow-x:hidden;max-height:unset}.featured-area.svelte-mwgvqh.svelte-mwgvqh{position:relative;padding:10px;text-align:center}.featured-area.svelte-mwgvqh h3.svelte-mwgvqh{position:absolute;color:var(--orchestra-light-3);background:rgba(0, 0, 0, 0.5);padding:5px;border-radius:5px}.featured-area.svelte-mwgvqh h3.svelte-mwgvqh{bottom:50%;left:50%;transform:translate(-50%, 50%)}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VjdGlvbkZlYXR1cmVkQXJlYXMuc3ZlbHRlIiwibWFwcGluZ3MiOiJBQU1JLDJDQUFnQixDQUNaLE9BQU8sQ0FBRSxJQUFJLENBQ2IscUJBQXFCLENBQUUsT0FBTyxRQUFRLENBQUMsQ0FBQyxPQUFPLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQzNELFNBQVMsQ0FBRSxNQUFNLENBQ2pCLEdBQUcsQ0FBRSxHQUFHLENBQ1IsZUFBZSxDQUFFLE1BQU0sQ0FDdkIsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsVUFBVSxDQUFFLE1BQU0sQ0FDbEIsVUFBVSxDQUFFLEtBRWhCLENBRUEsMENBQWUsQ0FDWCxRQUFRLENBQUUsUUFBUSxDQUNsQixPQUFPLENBQUUsSUFBSSxDQUNiLFVBQVUsQ0FBRSxNQUNoQixDQUVBLDRCQUFjLENBQUMsZ0JBQUcsQ0FDZCxRQUFRLENBQUUsUUFBUSxDQUNsQixLQUFLLENBQUUsSUFBSSxtQkFBbUIsQ0FBQyxDQUMvQixVQUFVLENBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FDOUIsT0FBTyxDQUFFLEdBQUcsQ0FDWixhQUFhLENBQUUsR0FDbkIsQ0FFQSw0QkFBYyxDQUFDLGdCQUFHLENBQ2QsTUFBTSxDQUFFLEdBQUcsQ0FDWCxJQUFJLENBQUUsR0FBRyxDQUNULFNBQVMsQ0FBRSxVQUFVLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FDbEMiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiU2VjdGlvbkZlYXR1cmVkQXJlYXMuc3ZlbHRlIl19 */");
	}

	function get_each_context$5(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[1] = list[i];
		return child_ctx;
	}

	// (50:16) {:else}
	function create_else_block$5(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for featured area");
				add_location(img, file$i, 50, 20, 1472);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			p: noop$3,
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block$5.name,
			type: "else",
			source: "(50:16) {:else}",
			ctx
		});

		return block;
	}

	// (48:37) 
	function create_if_block_1$4(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = /*area*/ ctx[1].image)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for featured area");
				add_location(img, file$i, 48, 20, 1367);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			p: function update(ctx, dirty) {
				if (dirty & /*$featuredAreas*/ 1 && !src_url_equal(img.src, img_src_value = /*area*/ ctx[1].image)) {
					attr_dev(img, "src", img_src_value);
				}
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_1$4.name,
			type: "if",
			source: "(48:37) ",
			ctx
		});

		return block;
	}

	// (46:16) {#if area.image && area.image?.ext_src}
	function create_if_block$5(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: /*area*/ ctx[1].image },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				const image_changes = {};
				if (dirty & /*$featuredAreas*/ 1) image_changes.image = /*area*/ ctx[1].image;
				image.$set(image_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$5.name,
			type: "if",
			source: "(46:16) {#if area.image && area.image?.ext_src}",
			ctx
		});

		return block;
	}

	// (44:8) {#each $featuredAreas.slice(0, maxFeaturedAreas) as area}
	function create_each_block$5(ctx) {
		let div;
		let current_block_type_index;
		let if_block;
		let t0;
		let h3;
		let t1_value = /*area*/ ctx[1].name + "";
		let t1;
		let t2;
		let current;
		const if_block_creators = [create_if_block$5, create_if_block_1$4, create_else_block$5];
		const if_blocks = [];

		function select_block_type(ctx, dirty) {
			if (/*area*/ ctx[1].image && /*area*/ ctx[1].image?.ext_src) return 0;
			if (/*area*/ ctx[1].image) return 1;
			return 2;
		}

		current_block_type_index = select_block_type(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

		const block = {
			c: function create() {
				div = element("div");
				if_block.c();
				t0 = space();
				h3 = element("h3");
				t1 = text(t1_value);
				t2 = space();
				attr_dev(h3, "class", "svelte-mwgvqh");
				add_location(h3, file$i, 52, 16, 1577);
				attr_dev(div, "class", "featured-area svelte-mwgvqh");
				add_location(div, file$i, 44, 12, 1176);
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);
				if_blocks[current_block_type_index].m(div, null);
				append_dev(div, t0);
				append_dev(div, h3);
				append_dev(h3, t1);
				append_dev(div, t2);
				current = true;
			},
			p: function update(ctx, dirty) {
				let previous_block_index = current_block_type_index;
				current_block_type_index = select_block_type(ctx);

				if (current_block_type_index === previous_block_index) {
					if_blocks[current_block_type_index].p(ctx, dirty);
				} else {
					group_outros();

					transition_out(if_blocks[previous_block_index], 1, 1, () => {
						if_blocks[previous_block_index] = null;
					});

					check_outros();
					if_block = if_blocks[current_block_type_index];

					if (!if_block) {
						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
						if_block.c();
					} else {
						if_block.p(ctx, dirty);
					}

					transition_in(if_block, 1);
					if_block.m(div, t0);
				}

				if ((!current || dirty & /*$featuredAreas*/ 1) && t1_value !== (t1_value = /*area*/ ctx[1].name + "")) set_data_dev(t1, t1_value);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(if_block);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
				}

				if_blocks[current_block_type_index].d();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_each_block$5.name,
			type: "each",
			source: "(44:8) {#each $featuredAreas.slice(0, maxFeaturedAreas) as area}",
			ctx
		});

		return block;
	}

	function create_fragment$i(ctx) {
		let section;
		let h2;
		let t1;
		let p;
		let t3;
		let div;
		let current;
		let each_value = ensure_array_like_dev(/*$featuredAreas*/ ctx[0].slice(0, maxFeaturedAreas));
		let each_blocks = [];

		for (let i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$5(get_each_context$5(ctx, each_value, i));
		}

		const out = i => transition_out(each_blocks[i], 1, 1, () => {
			each_blocks[i] = null;
		});

		const block = {
			c: function create() {
				section = element("section");
				h2 = element("h2");
				h2.textContent = `${featuredAreaSection.name}`;
				t1 = space();
				p = element("p");
				p.textContent = `${featuredAreaSection.description}`;
				t3 = space();
				div = element("div");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				add_location(h2, file$i, 40, 4, 984);
				add_location(p, file$i, 41, 4, 1024);
				attr_dev(div, "class", "featured-areas svelte-mwgvqh");
				add_location(div, file$i, 42, 4, 1069);
				attr_dev(section, "class", "section featured-areas-section");
				add_location(section, file$i, 39, 0, 931);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, section, anchor);
				append_dev(section, h2);
				append_dev(section, t1);
				append_dev(section, p);
				append_dev(section, t3);
				append_dev(section, div);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div, null);
					}
				}

				current = true;
			},
			p: function update(ctx, [dirty]) {
				if (dirty & /*$featuredAreas*/ 1) {
					each_value = ensure_array_like_dev(/*$featuredAreas*/ ctx[0].slice(0, maxFeaturedAreas));
					let i;

					for (i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$5(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(child_ctx, dirty);
							transition_in(each_blocks[i], 1);
						} else {
							each_blocks[i] = create_each_block$5(child_ctx);
							each_blocks[i].c();
							transition_in(each_blocks[i], 1);
							each_blocks[i].m(div, null);
						}
					}

					group_outros();

					for (i = each_value.length; i < each_blocks.length; i += 1) {
						out(i);
					}

					check_outros();
				}
			},
			i: function intro(local) {
				if (current) return;

				for (let i = 0; i < each_value.length; i += 1) {
					transition_in(each_blocks[i]);
				}

				current = true;
			},
			o: function outro(local) {
				each_blocks = each_blocks.filter(Boolean);

				for (let i = 0; i < each_blocks.length; i += 1) {
					transition_out(each_blocks[i]);
				}

				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(section);
				}

				destroy_each(each_blocks, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$i.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$i($$self, $$props, $$invalidate) {
		let $featuredAreas;
		validate_store(featuredAreas, 'featuredAreas');
		component_subscribe($$self, featuredAreas, $$value => $$invalidate(0, $featuredAreas = $$value));
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('SectionFeaturedAreas', slots, []);
		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<SectionFeaturedAreas> was created with unknown prop '${key}'`);
		});

		$$self.$capture_state = () => ({
			featuredAreas,
			maxFeaturedAreas,
			featuredAreaSection,
			placeholderImage,
			Image,
			$featuredAreas
		});

		return [$featuredAreas];
	}

	class SectionFeaturedAreas extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$i, create_fragment$i, safe_not_equal, {}, add_css$g);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "SectionFeaturedAreas",
				options,
				id: create_fragment$i.name
			});
		}
	}

	create_custom_element(SectionFeaturedAreas, {}, [], [], true);

	const previewSize = writable('desktop');

	/* src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/ListingToolbar.svelte generated by Svelte v4.2.18 */
	const file$h = "src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/ListingToolbar.svelte";

	function add_css$f(target) {
		append_styles(target, "svelte-yjcfq4", ".toolbar.svelte-yjcfq4.svelte-yjcfq4{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;padding:10px}.toolbar.svelte-yjcfq4 button.svelte-yjcfq4{background:none;border:none;cursor:pointer;color:var(--orchestra-primary-5)}.back-button.svelte-yjcfq4.svelte-yjcfq4{padding:10px 0}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTGlzdGluZ1Rvb2xiYXIuc3ZlbHRlIiwibWFwcGluZ3MiOiJBQXFCSSxvQ0FBUyxDQUNMLE9BQU8sQ0FBRSxJQUFJLENBQ2IsZUFBZSxDQUFFLGFBQWEsQ0FDOUIsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsR0FBRyxDQUFFLElBQUksQ0FDVCxLQUFLLENBQUUsSUFBSSxDQUNYLE9BQU8sQ0FBRSxJQUNiLENBRUEsc0JBQVEsQ0FBQyxvQkFBTyxDQUNaLFVBQVUsQ0FBRSxJQUFJLENBQ2hCLE1BQU0sQ0FBRSxJQUFJLENBQ1osTUFBTSxDQUFFLE9BQU8sQ0FDZixLQUFLLENBQUUsSUFBSSxxQkFBcUIsQ0FDcEMsQ0FFQSx3Q0FBYSxDQUNULE9BQU8sQ0FBRSxJQUFJLENBQUMsQ0FDbEIiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiTGlzdGluZ1Rvb2xiYXIuc3ZlbHRlIl19 */");
	}

	function create_fragment$h(ctx) {
		let div2;
		let div0;
		let button0;
		let fontawesomeicon0;
		let t0;
		let t1;
		let div1;
		let button1;
		let fontawesomeicon1;
		let t2;
		let button2;
		let fontawesomeicon2;
		let t3;
		let button3;
		let fontawesomeicon3;
		let current;
		let mounted;
		let dispose;

		fontawesomeicon0 = new FontAwesomeIcon({
				props: { icon: faArrowLeft },
				$$inline: true
			});

		fontawesomeicon1 = new FontAwesomeIcon({ props: { icon: faHeart }, $$inline: true });

		fontawesomeicon2 = new FontAwesomeIcon({
				props: { icon: faEnvelope },
				$$inline: true
			});

		fontawesomeicon3 = new FontAwesomeIcon({
				props: { icon: faShareSquare },
				$$inline: true
			});

		const block = {
			c: function create() {
				div2 = element("div");
				div0 = element("div");
				button0 = element("button");
				create_component(fontawesomeicon0.$$.fragment);
				t0 = text("\n            Back to Listings");
				t1 = space();
				div1 = element("div");
				button1 = element("button");
				create_component(fontawesomeicon1.$$.fragment);
				t2 = space();
				button2 = element("button");
				create_component(fontawesomeicon2.$$.fragment);
				t3 = space();
				button3 = element("button");
				create_component(fontawesomeicon3.$$.fragment);
				attr_dev(button0, "class", "svelte-yjcfq4");
				add_location(button0, file$h, 44, 8, 937);
				attr_dev(div0, "class", "back-button svelte-yjcfq4");
				add_location(div0, file$h, 43, 4, 903);
				attr_dev(button1, "class", "svelte-yjcfq4");
				add_location(button1, file$h, 50, 8, 1123);
				attr_dev(button2, "class", "svelte-yjcfq4");
				add_location(button2, file$h, 53, 8, 1233);
				attr_dev(button3, "class", "svelte-yjcfq4");
				add_location(button3, file$h, 56, 8, 1342);
				attr_dev(div1, "class", "listing-actions");
				add_location(div1, file$h, 49, 4, 1085);
				attr_dev(div2, "class", "toolbar svelte-yjcfq4");
				add_location(div2, file$h, 42, 0, 877);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div2, anchor);
				append_dev(div2, div0);
				append_dev(div0, button0);
				mount_component(fontawesomeicon0, button0, null);
				append_dev(button0, t0);
				append_dev(div2, t1);
				append_dev(div2, div1);
				append_dev(div1, button1);
				mount_component(fontawesomeicon1, button1, null);
				append_dev(div1, t2);
				append_dev(div1, button2);
				mount_component(fontawesomeicon2, button2, null);
				append_dev(div1, t3);
				append_dev(div1, button3);
				mount_component(fontawesomeicon3, button3, null);
				current = true;

				if (!mounted) {
					dispose = [
						listen_dev(button0, "click", backToListings, false, false, false, false),
						listen_dev(button1, "click", favoriteProperty, false, false, false, false),
						listen_dev(button2, "click", contactAgent, false, false, false, false),
						listen_dev(button3, "click", shareProperty, false, false, false, false)
					];

					mounted = true;
				}
			},
			p: noop$3,
			i: function intro(local) {
				if (current) return;
				transition_in(fontawesomeicon0.$$.fragment, local);
				transition_in(fontawesomeicon1.$$.fragment, local);
				transition_in(fontawesomeicon2.$$.fragment, local);
				transition_in(fontawesomeicon3.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(fontawesomeicon0.$$.fragment, local);
				transition_out(fontawesomeicon1.$$.fragment, local);
				transition_out(fontawesomeicon2.$$.fragment, local);
				transition_out(fontawesomeicon3.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div2);
				}

				destroy_component(fontawesomeicon0);
				destroy_component(fontawesomeicon1);
				destroy_component(fontawesomeicon2);
				destroy_component(fontawesomeicon3);
				mounted = false;
				run_all(dispose);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$h.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function favoriteProperty() {
		alert('Favorite button clicked');
	}

	function contactAgent() {
		alert('Contact button clicked');
	}

	function shareProperty() {
		alert('Share button clicked');
	}

	function instance$h($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('ListingToolbar', slots, []);
		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ListingToolbar> was created with unknown prop '${key}'`);
		});

		$$self.$capture_state = () => ({
			FontAwesomeIcon,
			faHeart,
			faEnvelope,
			faShareSquare,
			faArrowLeft,
			backToListings,
			favoriteProperty,
			contactAgent,
			shareProperty
		});

		return [];
	}

	class ListingToolbar extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$h, create_fragment$h, safe_not_equal, {}, add_css$f);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "ListingToolbar",
				options,
				id: create_fragment$h.name
			});
		}
	}

	create_custom_element(ListingToolbar, {}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/PropertyInfoHeader.svelte generated by Svelte v4.2.18 */
	const file$g = "src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/PropertyInfoHeader.svelte";

	function add_css$e(target) {
		append_styles(target, "svelte-dchcly", ".property-header.svelte-dchcly.svelte-dchcly{display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start;width:100%}.property-info-row.svelte-dchcly.svelte-dchcly{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;width:100%;gap:10px}.property-details.svelte-dchcly.svelte-dchcly,.price-bed-bath.svelte-dchcly.svelte-dchcly{display:flex;flex-direction:column}.property-attributes.svelte-dchcly.svelte-dchcly,.bed-bath.svelte-dchcly.svelte-dchcly{display:flex;gap:20px}.price-bed-bath.svelte-dchcly h3.svelte-dchcly,.property-details.svelte-dchcly h2.svelte-dchcly{margin:0;padding:0}@media screen and (max-width: 768px){.property-header.svelte-dchcly.svelte-dchcly{flex-direction:column}.property-info-row.svelte-dchcly.svelte-dchcly{flex-direction:column;align-items:flex-start;gap:10px}}@media screen and (max-width: 480px){.property-header.svelte-dchcly.svelte-dchcly{flex-direction:column}.property-info-row.svelte-dchcly.svelte-dchcly{flex-direction:column;align-items:flex-start;gap:5px}.property-attributes.svelte-dchcly.svelte-dchcly,.bed-bath.svelte-dchcly.svelte-dchcly{flex-direction:column;gap:10px}}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHJvcGVydHlJbmZvSGVhZGVyLnN2ZWx0ZSIsIm1hcHBpbmdzIjoiQUFLSSw0Q0FBaUIsQ0FDYixPQUFPLENBQUUsSUFBSSxDQUNiLGNBQWMsQ0FBRSxNQUFNLENBQ3RCLGVBQWUsQ0FBRSxhQUFhLENBQzlCLFdBQVcsQ0FBRSxVQUFVLENBQ3ZCLEtBQUssQ0FBRSxJQUNYLENBRUEsOENBQW1CLENBQ2YsT0FBTyxDQUFFLElBQUksQ0FDYixlQUFlLENBQUUsYUFBYSxDQUM5QixXQUFXLENBQUUsVUFBVSxDQUN2QixTQUFTLENBQUUsSUFBSSxDQUNmLEtBQUssQ0FBRSxJQUFJLENBQ1gsR0FBRyxDQUFFLElBQ1QsQ0FFQSw2Q0FBaUIsQ0FBRSwyQ0FBZ0IsQ0FDL0IsT0FBTyxDQUFFLElBQUksQ0FDYixjQUFjLENBQUUsTUFDcEIsQ0FFQSxnREFBb0IsQ0FBRSxxQ0FBVSxDQUM1QixPQUFPLENBQUUsSUFBSSxDQUNiLEdBQUcsQ0FBRSxJQUNULENBRUEsNkJBQWUsQ0FBQyxnQkFBRSxDQUFFLCtCQUFpQixDQUFDLGdCQUFHLENBQ3JDLE1BQU0sQ0FBRSxDQUFDLENBQ1QsT0FBTyxDQUFFLENBQ2IsQ0FFQSxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsWUFBWSxLQUFLLENBQUUsQ0FDakMsNENBQWlCLENBQ2IsY0FBYyxDQUFFLE1BQ3BCLENBRUEsOENBQW1CLENBQ2YsY0FBYyxDQUFFLE1BQU0sQ0FDdEIsV0FBVyxDQUFFLFVBQVUsQ0FDdkIsR0FBRyxDQUFFLElBQ1QsQ0FDSixDQUVBLE9BQU8sTUFBTSxDQUFDLEdBQUcsQ0FBQyxZQUFZLEtBQUssQ0FBRSxDQUNqQyw0Q0FBaUIsQ0FDYixjQUFjLENBQUUsTUFDcEIsQ0FFQSw4Q0FBbUIsQ0FDZixjQUFjLENBQUUsTUFBTSxDQUN0QixXQUFXLENBQUUsVUFBVSxDQUN2QixHQUFHLENBQUUsR0FDVCxDQUVBLGdEQUFvQixDQUFFLHFDQUFVLENBQzVCLGNBQWMsQ0FBRSxNQUFNLENBQ3RCLEdBQUcsQ0FBRSxJQUNULENBQ0oiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiUHJvcGVydHlJbmZvSGVhZGVyLnN2ZWx0ZSJdfQ== */");
	}

	function create_fragment$g(ctx) {
		let div10;
		let div2;
		let div0;
		let h2;
		let t0_value = (/*$selectedListing*/ ctx[0].address || '1xx Main St., Dallas, TX 75214') + "";
		let t0;
		let t1;
		let div1;
		let h3;
		let t2_value = (/*$selectedListing*/ ctx[0].price || '$price') + "";
		let t2;
		let t3;
		let div9;
		let div5;
		let div3;
		let t4_value = (/*$selectedListing*/ ctx[0].sqft || '1xx9 sqft') + "";
		let t4;
		let t5;
		let div4;
		let t6;
		let t7_value = (/*$selectedListing*/ ctx[0].yearBuilt || '2017') + "";
		let t7;
		let t8;
		let div8;
		let div6;
		let t9_value = (/*$selectedListing*/ ctx[0].bedrooms || '3') + "";
		let t9;
		let t10;
		let t11;
		let div7;
		let t12_value = (/*$selectedListing*/ ctx[0].bathrooms || '2') + "";
		let t12;
		let t13;

		const block = {
			c: function create() {
				div10 = element("div");
				div2 = element("div");
				div0 = element("div");
				h2 = element("h2");
				t0 = text(t0_value);
				t1 = space();
				div1 = element("div");
				h3 = element("h3");
				t2 = text(t2_value);
				t3 = space();
				div9 = element("div");
				div5 = element("div");
				div3 = element("div");
				t4 = text(t4_value);
				t5 = space();
				div4 = element("div");
				t6 = text("Built in ");
				t7 = text(t7_value);
				t8 = space();
				div8 = element("div");
				div6 = element("div");
				t9 = text(t9_value);
				t10 = text(" bd");
				t11 = space();
				div7 = element("div");
				t12 = text(t12_value);
				t13 = text(" ba");
				attr_dev(h2, "class", "svelte-dchcly");
				add_location(h2, file$g, 74, 12, 1688);
				attr_dev(div0, "class", "property-details svelte-dchcly");
				add_location(div0, file$g, 73, 8, 1645);
				attr_dev(h3, "class", "svelte-dchcly");
				add_location(h3, file$g, 77, 12, 1824);
				attr_dev(div1, "class", "price-bed-bath svelte-dchcly");
				add_location(div1, file$g, 76, 8, 1783);
				attr_dev(div2, "class", "property-info-row svelte-dchcly");
				add_location(div2, file$g, 72, 4, 1605);
				add_location(div3, file$g, 84, 12, 2046);
				add_location(div4, file$g, 85, 12, 2108);
				attr_dev(div5, "class", "property-attributes svelte-dchcly");
				add_location(div5, file$g, 83, 8, 2000);
				add_location(div6, file$g, 88, 12, 2225);
				add_location(div7, file$g, 89, 12, 2286);
				attr_dev(div8, "class", "bed-bath svelte-dchcly");
				add_location(div8, file$g, 87, 8, 2190);
				attr_dev(div9, "class", "property-info-row svelte-dchcly");
				add_location(div9, file$g, 82, 4, 1960);
				attr_dev(div10, "class", "property-header svelte-dchcly");
				add_location(div10, file$g, 70, 0, 1532);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div10, anchor);
				append_dev(div10, div2);
				append_dev(div2, div0);
				append_dev(div0, h2);
				append_dev(h2, t0);
				append_dev(div2, t1);
				append_dev(div2, div1);
				append_dev(div1, h3);
				append_dev(h3, t2);
				append_dev(div10, t3);
				append_dev(div10, div9);
				append_dev(div9, div5);
				append_dev(div5, div3);
				append_dev(div3, t4);
				append_dev(div5, t5);
				append_dev(div5, div4);
				append_dev(div4, t6);
				append_dev(div4, t7);
				append_dev(div9, t8);
				append_dev(div9, div8);
				append_dev(div8, div6);
				append_dev(div6, t9);
				append_dev(div6, t10);
				append_dev(div8, t11);
				append_dev(div8, div7);
				append_dev(div7, t12);
				append_dev(div7, t13);
			},
			p: function update(ctx, [dirty]) {
				if (dirty & /*$selectedListing*/ 1 && t0_value !== (t0_value = (/*$selectedListing*/ ctx[0].address || '1xx Main St., Dallas, TX 75214') + "")) set_data_dev(t0, t0_value);
				if (dirty & /*$selectedListing*/ 1 && t2_value !== (t2_value = (/*$selectedListing*/ ctx[0].price || '$price') + "")) set_data_dev(t2, t2_value);
				if (dirty & /*$selectedListing*/ 1 && t4_value !== (t4_value = (/*$selectedListing*/ ctx[0].sqft || '1xx9 sqft') + "")) set_data_dev(t4, t4_value);
				if (dirty & /*$selectedListing*/ 1 && t7_value !== (t7_value = (/*$selectedListing*/ ctx[0].yearBuilt || '2017') + "")) set_data_dev(t7, t7_value);
				if (dirty & /*$selectedListing*/ 1 && t9_value !== (t9_value = (/*$selectedListing*/ ctx[0].bedrooms || '3') + "")) set_data_dev(t9, t9_value);
				if (dirty & /*$selectedListing*/ 1 && t12_value !== (t12_value = (/*$selectedListing*/ ctx[0].bathrooms || '2') + "")) set_data_dev(t12, t12_value);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div10);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$g.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$g($$self, $$props, $$invalidate) {
		let $selectedListing;
		validate_store(selectedListing, 'selectedListing');
		component_subscribe($$self, selectedListing, $$value => $$invalidate(0, $selectedListing = $$value));
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('PropertyInfoHeader', slots, []);
		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<PropertyInfoHeader> was created with unknown prop '${key}'`);
		});

		$$self.$capture_state = () => ({ selectedListing, $selectedListing });
		return [$selectedListing];
	}

	class PropertyInfoHeader extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$g, create_fragment$g, safe_not_equal, {}, add_css$e);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "PropertyInfoHeader",
				options,
				id: create_fragment$g.name
			});
		}
	}

	create_custom_element(PropertyInfoHeader, {}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/PropertyImage.svelte generated by Svelte v4.2.18 */
	const file$f = "src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/PropertyImage.svelte";

	function add_css$d(target) {
		append_styles(target, "svelte-161lhn", ".listing-image.svelte-161lhn.svelte-161lhn{width:100%;display:flex;justify-content:center;align-items:flex-start}.listing-image.svelte-161lhn img.svelte-161lhn{width:100%;height:auto;object-fit:cover}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHJvcGVydHlJbWFnZS5zdmVsdGUiLCJtYXBwaW5ncyI6IkFBUUksMENBQWUsQ0FDWCxLQUFLLENBQUUsSUFBSSxDQUNYLE9BQU8sQ0FBRSxJQUFJLENBQ2IsZUFBZSxDQUFFLE1BQU0sQ0FDdkIsV0FBVyxDQUFFLFVBQ2pCLENBRUEsNEJBQWMsQ0FBQyxpQkFBSSxDQUNmLEtBQUssQ0FBRSxJQUFJLENBQ1gsTUFBTSxDQUFFLElBQUksQ0FDWixVQUFVLENBQUUsS0FDaEIiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiUHJvcGVydHlJbWFnZS5zdmVsdGUiXX0= */");
	}

	// (31:4) {:else}
	function create_else_block$4(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = /*placeholderImage*/ ctx[0])) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder Image");
				attr_dev(img, "class", "svelte-161lhn");
				add_location(img, file$f, 31, 8, 869);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			p: function update(ctx, dirty) {
				if (dirty & /*placeholderImage*/ 1 && !src_url_equal(img.src, img_src_value = /*placeholderImage*/ ctx[0])) {
					attr_dev(img, "src", img_src_value);
				}
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block$4.name,
			type: "else",
			source: "(31:4) {:else}",
			ctx
		});

		return block;
	}

	// (29:37) 
	function create_if_block_1$3(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = /*$selectedListing*/ ctx[1].image)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Primary Listing Image");
				attr_dev(img, "class", "svelte-161lhn");
				add_location(img, file$f, 29, 8, 784);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			p: function update(ctx, dirty) {
				if (dirty & /*$selectedListing*/ 2 && !src_url_equal(img.src, img_src_value = /*$selectedListing*/ ctx[1].image)) {
					attr_dev(img, "src", img_src_value);
				}
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_1$3.name,
			type: "if",
			source: "(29:37) ",
			ctx
		});

		return block;
	}

	// (27:4) {#if $selectedListing.image && $selectedListing.image?.ext_src}
	function create_if_block$4(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: /*$selectedListing*/ ctx[1].image },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				const image_changes = {};
				if (dirty & /*$selectedListing*/ 2) image_changes.image = /*$selectedListing*/ ctx[1].image;
				image.$set(image_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$4.name,
			type: "if",
			source: "(27:4) {#if $selectedListing.image && $selectedListing.image?.ext_src}",
			ctx
		});

		return block;
	}

	function create_fragment$f(ctx) {
		let div;
		let current_block_type_index;
		let if_block;
		let current;
		const if_block_creators = [create_if_block$4, create_if_block_1$3, create_else_block$4];
		const if_blocks = [];

		function select_block_type(ctx, dirty) {
			if (/*$selectedListing*/ ctx[1].image && /*$selectedListing*/ ctx[1].image?.ext_src) return 0;
			if (/*$selectedListing*/ ctx[1].image) return 1;
			return 2;
		}

		current_block_type_index = select_block_type(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

		const block = {
			c: function create() {
				div = element("div");
				if_block.c();
				attr_dev(div, "class", "listing-image svelte-161lhn");
				add_location(div, file$f, 25, 0, 593);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);
				if_blocks[current_block_type_index].m(div, null);
				current = true;
			},
			p: function update(ctx, [dirty]) {
				let previous_block_index = current_block_type_index;
				current_block_type_index = select_block_type(ctx);

				if (current_block_type_index === previous_block_index) {
					if_blocks[current_block_type_index].p(ctx, dirty);
				} else {
					group_outros();

					transition_out(if_blocks[previous_block_index], 1, 1, () => {
						if_blocks[previous_block_index] = null;
					});

					check_outros();
					if_block = if_blocks[current_block_type_index];

					if (!if_block) {
						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
						if_block.c();
					} else {
						if_block.p(ctx, dirty);
					}

					transition_in(if_block, 1);
					if_block.m(div, null);
				}
			},
			i: function intro(local) {
				if (current) return;
				transition_in(if_block);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
				}

				if_blocks[current_block_type_index].d();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$f.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$f($$self, $$props, $$invalidate) {
		let $selectedListing;
		validate_store(selectedListing, 'selectedListing');
		component_subscribe($$self, selectedListing, $$value => $$invalidate(1, $selectedListing = $$value));
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('PropertyImage', slots, []);
		let { placeholderImage } = $$props;

		$$self.$$.on_mount.push(function () {
			if (placeholderImage === undefined && !('placeholderImage' in $$props || $$self.$$.bound[$$self.$$.props['placeholderImage']])) {
				console.warn("<PropertyImage> was created without expected prop 'placeholderImage'");
			}
		});

		const writable_props = ['placeholderImage'];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<PropertyImage> was created with unknown prop '${key}'`);
		});

		$$self.$$set = $$props => {
			if ('placeholderImage' in $$props) $$invalidate(0, placeholderImage = $$props.placeholderImage);
		};

		$$self.$capture_state = () => ({
			selectedListing,
			Image,
			placeholderImage,
			$selectedListing
		});

		$$self.$inject_state = $$props => {
			if ('placeholderImage' in $$props) $$invalidate(0, placeholderImage = $$props.placeholderImage);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [placeholderImage, $selectedListing];
	}

	class PropertyImage extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$f, create_fragment$f, safe_not_equal, { placeholderImage: 0 }, add_css$d);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "PropertyImage",
				options,
				id: create_fragment$f.name
			});
		}

		get placeholderImage() {
			return this.$$.ctx[0];
		}

		set placeholderImage(placeholderImage) {
			this.$$set({ placeholderImage });
			flush();
		}
	}

	create_custom_element(PropertyImage, {"placeholderImage":{}}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/MoreImagesGrid.svelte generated by Svelte v4.2.18 */
	const file$e = "src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/MoreImagesGrid.svelte";

	function add_css$c(target) {
		append_styles(target, "svelte-66t9j5", ".more-images-grid.svelte-66t9j5.svelte-66t9j5{display:grid;grid-template-columns:repeat(auto-fill, minmax(100px, 1fr));padding:10px;gap:5px;width:100%;overflow-y:auto;max-height:350px}.more-images-grid.svelte-66t9j5 img.svelte-66t9j5{width:100%;height:auto;object-fit:cover}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTW9yZUltYWdlc0dyaWQuc3ZlbHRlIiwibWFwcGluZ3MiOiJBQU1JLDZDQUFrQixDQUNkLE9BQU8sQ0FBRSxJQUFJLENBQ2IscUJBQXFCLENBQUUsT0FBTyxTQUFTLENBQUMsQ0FBQyxPQUFPLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQzVELE9BQU8sQ0FBRSxJQUFJLENBQ2IsR0FBRyxDQUFFLEdBQUcsQ0FDUixLQUFLLENBQUUsSUFBSSxDQUNYLFVBQVUsQ0FBRSxJQUFJLENBQ2hCLFVBQVUsQ0FBRSxLQUNoQixDQUVBLCtCQUFpQixDQUFDLGlCQUFJLENBQ2xCLEtBQUssQ0FBRSxJQUFJLENBQ1gsTUFBTSxDQUFFLElBQUksQ0FDWixVQUFVLENBQUUsS0FDaEIiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiTW9yZUltYWdlc0dyaWQuc3ZlbHRlIl19 */");
	}

	function get_each_context$4(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[2] = list[i];
		child_ctx[4] = i;
		return child_ctx;
	}

	// (28:4) {#each Array(numberOfPlaceholders) as _, i}
	function create_each_block$4(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = /*placeholderImage*/ ctx[0])) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder Image " + (/*i*/ ctx[4] + 1));
				attr_dev(img, "class", "svelte-66t9j5");
				add_location(img, file$e, 28, 8, 705);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			p: function update(ctx, dirty) {
				if (dirty & /*placeholderImage*/ 1 && !src_url_equal(img.src, img_src_value = /*placeholderImage*/ ctx[0])) {
					attr_dev(img, "src", img_src_value);
				}
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_each_block$4.name,
			type: "each",
			source: "(28:4) {#each Array(numberOfPlaceholders) as _, i}",
			ctx
		});

		return block;
	}

	function create_fragment$e(ctx) {
		let div;
		let each_value = ensure_array_like_dev(Array(/*numberOfPlaceholders*/ ctx[1]));
		let each_blocks = [];

		for (let i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
		}

		const block = {
			c: function create() {
				div = element("div");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				attr_dev(div, "class", "more-images-grid svelte-66t9j5");
				add_location(div, file$e, 26, 0, 618);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div, null);
					}
				}
			},
			p: function update(ctx, [dirty]) {
				if (dirty & /*placeholderImage, numberOfPlaceholders*/ 3) {
					each_value = ensure_array_like_dev(Array(/*numberOfPlaceholders*/ ctx[1]));
					let i;

					for (i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$4(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(child_ctx, dirty);
						} else {
							each_blocks[i] = create_each_block$4(child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(div, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}

					each_blocks.length = each_value.length;
				}
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
				}

				destroy_each(each_blocks, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$e.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$e($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('MoreImagesGrid', slots, []);
		let { placeholderImage } = $$props;
		let { numberOfPlaceholders = 20 } = $$props;

		$$self.$$.on_mount.push(function () {
			if (placeholderImage === undefined && !('placeholderImage' in $$props || $$self.$$.bound[$$self.$$.props['placeholderImage']])) {
				console.warn("<MoreImagesGrid> was created without expected prop 'placeholderImage'");
			}
		});

		const writable_props = ['placeholderImage', 'numberOfPlaceholders'];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<MoreImagesGrid> was created with unknown prop '${key}'`);
		});

		$$self.$$set = $$props => {
			if ('placeholderImage' in $$props) $$invalidate(0, placeholderImage = $$props.placeholderImage);
			if ('numberOfPlaceholders' in $$props) $$invalidate(1, numberOfPlaceholders = $$props.numberOfPlaceholders);
		};

		$$self.$capture_state = () => ({ placeholderImage, numberOfPlaceholders });

		$$self.$inject_state = $$props => {
			if ('placeholderImage' in $$props) $$invalidate(0, placeholderImage = $$props.placeholderImage);
			if ('numberOfPlaceholders' in $$props) $$invalidate(1, numberOfPlaceholders = $$props.numberOfPlaceholders);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [placeholderImage, numberOfPlaceholders];
	}

	class MoreImagesGrid extends SvelteComponentDev {
		constructor(options) {
			super(options);

			init(
				this,
				options,
				instance$e,
				create_fragment$e,
				safe_not_equal,
				{
					placeholderImage: 0,
					numberOfPlaceholders: 1
				},
				add_css$c
			);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "MoreImagesGrid",
				options,
				id: create_fragment$e.name
			});
		}

		get placeholderImage() {
			return this.$$.ctx[0];
		}

		set placeholderImage(placeholderImage) {
			this.$$set({ placeholderImage });
			flush();
		}

		get numberOfPlaceholders() {
			return this.$$.ctx[1];
		}

		set numberOfPlaceholders(numberOfPlaceholders) {
			this.$$set({ numberOfPlaceholders });
			flush();
		}
	}

	create_custom_element(MoreImagesGrid, {"placeholderImage":{},"numberOfPlaceholders":{}}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/PropertyMatchSummary.svelte generated by Svelte v4.2.18 */
	const file$d = "src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/PropertyMatchSummary.svelte";

	function add_css$b(target) {
		append_styles(target, "svelte-1ixlv7m", ".high-level-summary.svelte-1ixlv7m h4.svelte-1ixlv7m{margin:0}.high-level-summary.svelte-1ixlv7m.svelte-1ixlv7m{margin-top:10px;padding:15px;border-radius:8px;background-color:var(--orchestra-cardBackground-2);border:1px solid var(--orchestra-borderColor)}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHJvcGVydHlNYXRjaFN1bW1hcnkuc3ZlbHRlIiwibWFwcGluZ3MiOiJBQUlJLGtDQUFtQixDQUFDLGlCQUFHLENBQ25CLE1BQU0sQ0FBRSxDQUNaLENBRUEsaURBQW9CLENBQ2hCLFVBQVUsQ0FBRSxJQUFJLENBQ2hCLE9BQU8sQ0FBRSxJQUFJLENBQ2IsYUFBYSxDQUFFLEdBQUcsQ0FDbEIsZ0JBQWdCLENBQUUsSUFBSSw0QkFBNEIsQ0FBQyxDQUNuRCxNQUFNLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLHVCQUF1QixDQUNqRCIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJQcm9wZXJ0eU1hdGNoU3VtbWFyeS5zdmVsdGUiXX0= */");
	}

	function create_fragment$d(ctx) {
		let div;
		let h4;
		let t1;
		let p;

		const block = {
			c: function create() {
				div = element("div");
				h4 = element("h4");
				h4.textContent = "Property Summary";
				t1 = space();
				p = element("p");
				p.textContent = "Placeholder text for user-defined high-level requirements and needs.";
				attr_dev(h4, "class", "svelte-1ixlv7m");
				add_location(h4, file$d, 21, 4, 518);
				add_location(p, file$d, 22, 4, 548);
				attr_dev(div, "class", "high-level-summary svelte-1ixlv7m");
				add_location(div, file$d, 20, 0, 481);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);
				append_dev(div, h4);
				append_dev(div, t1);
				append_dev(div, p);
			},
			p: noop$3,
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$d.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$d($$self, $$props) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('PropertyMatchSummary', slots, []);
		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<PropertyMatchSummary> was created with unknown prop '${key}'`);
		});

		return [];
	}

	class PropertyMatchSummary extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$d, create_fragment$d, safe_not_equal, {}, add_css$b);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "PropertyMatchSummary",
				options,
				id: create_fragment$d.name
			});
		}
	}

	create_custom_element(PropertyMatchSummary, {}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/ListingAttributes/AttributeContent.svelte generated by Svelte v4.2.18 */
	const file$c = "src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/ListingAttributes/AttributeContent.svelte";

	function add_css$a(target) {
		append_styles(target, "svelte-1k7bv", ".category-content.svelte-1k7bv{display:flex;justify-content:center;align-items:center;padding:20px;width:100%;height:100%;border-radius:5px;border:1px solid var(--orchestra-borderColor);background-color:var(--orchestra-backgroundColor)}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQXR0cmlidXRlQ29udGVudC5zdmVsdGUiLCJtYXBwaW5ncyI6IkFBTUksOEJBQWtCLENBQ2QsT0FBTyxDQUFFLElBQUksQ0FDYixlQUFlLENBQUUsTUFBTSxDQUN2QixXQUFXLENBQUUsTUFBTSxDQUNuQixPQUFPLENBQUUsSUFBSSxDQUNiLEtBQUssQ0FBRSxJQUFJLENBQ1gsTUFBTSxDQUFFLElBQUksQ0FDWixhQUFhLENBQUUsR0FBRyxDQUNsQixNQUFNLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLHVCQUF1QixDQUFDLENBQzlDLGdCQUFnQixDQUFFLElBQUksMkJBQTJCLENBQ3JEIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbIkF0dHJpYnV0ZUNvbnRlbnQuc3ZlbHRlIl19 */");
	}

	function create_fragment$c(ctx) {
		let div;
		let p;
		let t0;
		let t1_value = /*subTab*/ ctx[1].replace(/([A-Z])/g, ' $1').toLowerCase() + "";
		let t1;
		let t2;
		let t3_value = /*tab*/ ctx[0].replace(/([A-Z])/g, ' $1').toLowerCase() + "";
		let t3;
		let t4;

		const block = {
			c: function create() {
				div = element("div");
				p = element("p");
				t0 = text("Content for the ");
				t1 = text(t1_value);
				t2 = text(" tab under ");
				t3 = text(t3_value);
				t4 = text(".");
				add_location(p, file$c, 20, 4, 441);
				attr_dev(div, "class", "category-content svelte-1k7bv");
				add_location(div, file$c, 19, 0, 406);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);
				append_dev(div, p);
				append_dev(p, t0);
				append_dev(p, t1);
				append_dev(p, t2);
				append_dev(p, t3);
				append_dev(p, t4);
			},
			p: function update(ctx, [dirty]) {
				if (dirty & /*subTab*/ 2 && t1_value !== (t1_value = /*subTab*/ ctx[1].replace(/([A-Z])/g, ' $1').toLowerCase() + "")) set_data_dev(t1, t1_value);
				if (dirty & /*tab*/ 1 && t3_value !== (t3_value = /*tab*/ ctx[0].replace(/([A-Z])/g, ' $1').toLowerCase() + "")) set_data_dev(t3, t3_value);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$c.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$c($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('AttributeContent', slots, []);
		let { tab } = $$props;
		let { subTab } = $$props;

		$$self.$$.on_mount.push(function () {
			if (tab === undefined && !('tab' in $$props || $$self.$$.bound[$$self.$$.props['tab']])) {
				console.warn("<AttributeContent> was created without expected prop 'tab'");
			}

			if (subTab === undefined && !('subTab' in $$props || $$self.$$.bound[$$self.$$.props['subTab']])) {
				console.warn("<AttributeContent> was created without expected prop 'subTab'");
			}
		});

		const writable_props = ['tab', 'subTab'];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<AttributeContent> was created with unknown prop '${key}'`);
		});

		$$self.$$set = $$props => {
			if ('tab' in $$props) $$invalidate(0, tab = $$props.tab);
			if ('subTab' in $$props) $$invalidate(1, subTab = $$props.subTab);
		};

		$$self.$capture_state = () => ({ tab, subTab });

		$$self.$inject_state = $$props => {
			if ('tab' in $$props) $$invalidate(0, tab = $$props.tab);
			if ('subTab' in $$props) $$invalidate(1, subTab = $$props.subTab);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [tab, subTab];
	}

	class AttributeContent extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$c, create_fragment$c, safe_not_equal, { tab: 0, subTab: 1 }, add_css$a);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "AttributeContent",
				options,
				id: create_fragment$c.name
			});
		}

		get tab() {
			return this.$$.ctx[0];
		}

		set tab(tab) {
			this.$$set({ tab });
			flush();
		}

		get subTab() {
			return this.$$.ctx[1];
		}

		set subTab(subTab) {
			this.$$set({ subTab });
			flush();
		}
	}

	create_custom_element(AttributeContent, {"tab":{},"subTab":{}}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/ListingAttributes/ListingAttributesMobile.svelte generated by Svelte v4.2.18 */

	const { Object: Object_1$2 } = globals;
	const file$b = "src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/ListingAttributes/ListingAttributesMobile.svelte";

	function add_css$9(target) {
		append_styles(target, "svelte-cj44z", ".listing-detail-containers.svelte-cj44z{width:100%}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTGlzdGluZ0F0dHJpYnV0ZXNNb2JpbGUuc3ZlbHRlIiwibWFwcGluZ3MiOiJBQVFJLHVDQUEyQixDQUN2QixLQUFLLENBQUUsSUFDWCIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJMaXN0aW5nQXR0cmlidXRlc01vYmlsZS5zdmVsdGUiXX0= */");
	}

	function get_each_context$3(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[1] = list[i];
		return child_ctx;
	}

	function get_each_context_1$2(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[4] = list[i];
		return child_ctx;
	}

	// (23:20) <CollapsibleContainer                         title={subTab.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}                         initCollapsed={false}                     >
	function create_default_slot_1$1(ctx) {
		let attributecontent;
		let t;
		let current;

		attributecontent = new AttributeContent({
				props: {
					tab: /*category*/ ctx[1],
					subTab: /*subTab*/ ctx[4]
				},
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(attributecontent.$$.fragment);
				t = space();
			},
			m: function mount(target, anchor) {
				mount_component(attributecontent, target, anchor);
				insert_dev(target, t, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				const attributecontent_changes = {};
				if (dirty & /*categories*/ 1) attributecontent_changes.tab = /*category*/ ctx[1];
				if (dirty & /*categories*/ 1) attributecontent_changes.subTab = /*subTab*/ ctx[4];
				attributecontent.$set(attributecontent_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(attributecontent.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(attributecontent.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(t);
				}

				destroy_component(attributecontent, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_default_slot_1$1.name,
			type: "slot",
			source: "(23:20) <CollapsibleContainer                         title={subTab.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}                         initCollapsed={false}                     >",
			ctx
		});

		return block;
	}

	// (22:16) {#each categories[category] as subTab}
	function create_each_block_1$2(ctx) {
		let collapsiblecontainer;
		let current;

		collapsiblecontainer = new CollapsibleContainer({
				props: {
					title: /*subTab*/ ctx[4].replace(/([A-Z])/g, ' $1').replace(/^./, func$2),
					initCollapsed: false,
					$$slots: { default: [create_default_slot_1$1] },
					$$scope: { ctx }
				},
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(collapsiblecontainer.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(collapsiblecontainer, target, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				const collapsiblecontainer_changes = {};
				if (dirty & /*categories*/ 1) collapsiblecontainer_changes.title = /*subTab*/ ctx[4].replace(/([A-Z])/g, ' $1').replace(/^./, func$2);

				if (dirty & /*$$scope, categories*/ 129) {
					collapsiblecontainer_changes.$$scope = { dirty, ctx };
				}

				collapsiblecontainer.$set(collapsiblecontainer_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(collapsiblecontainer.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(collapsiblecontainer.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(collapsiblecontainer, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_each_block_1$2.name,
			type: "each",
			source: "(22:16) {#each categories[category] as subTab}",
			ctx
		});

		return block;
	}

	// (16:8) <CollapsibleContainer             title={category.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}             containerStyle='background-color: var(--orchestra-cardBackground-1);'             initCollapsed={false}         >
	function create_default_slot$2(ctx) {
		let div;
		let t;
		let current;
		let each_value_1 = ensure_array_like_dev(/*categories*/ ctx[0][/*category*/ ctx[1]]);
		let each_blocks = [];

		for (let i = 0; i < each_value_1.length; i += 1) {
			each_blocks[i] = create_each_block_1$2(get_each_context_1$2(ctx, each_value_1, i));
		}

		const out = i => transition_out(each_blocks[i], 1, 1, () => {
			each_blocks[i] = null;
		});

		const block = {
			c: function create() {
				div = element("div");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				t = space();
				add_location(div, file$b, 20, 12, 646);
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div, null);
					}
				}

				insert_dev(target, t, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				if (dirty & /*categories, Object*/ 1) {
					each_value_1 = ensure_array_like_dev(/*categories*/ ctx[0][/*category*/ ctx[1]]);
					let i;

					for (i = 0; i < each_value_1.length; i += 1) {
						const child_ctx = get_each_context_1$2(ctx, each_value_1, i);

						if (each_blocks[i]) {
							each_blocks[i].p(child_ctx, dirty);
							transition_in(each_blocks[i], 1);
						} else {
							each_blocks[i] = create_each_block_1$2(child_ctx);
							each_blocks[i].c();
							transition_in(each_blocks[i], 1);
							each_blocks[i].m(div, null);
						}
					}

					group_outros();

					for (i = each_value_1.length; i < each_blocks.length; i += 1) {
						out(i);
					}

					check_outros();
				}
			},
			i: function intro(local) {
				if (current) return;

				for (let i = 0; i < each_value_1.length; i += 1) {
					transition_in(each_blocks[i]);
				}

				current = true;
			},
			o: function outro(local) {
				each_blocks = each_blocks.filter(Boolean);

				for (let i = 0; i < each_blocks.length; i += 1) {
					transition_out(each_blocks[i]);
				}

				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
					detach_dev(t);
				}

				destroy_each(each_blocks, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_default_slot$2.name,
			type: "slot",
			source: "(16:8) <CollapsibleContainer             title={category.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}             containerStyle='background-color: var(--orchestra-cardBackground-1);'             initCollapsed={false}         >",
			ctx
		});

		return block;
	}

	// (15:4) {#each Object.keys(categories) as category}
	function create_each_block$3(ctx) {
		let collapsiblecontainer;
		let current;

		collapsiblecontainer = new CollapsibleContainer({
				props: {
					title: /*category*/ ctx[1].replace(/([A-Z])/g, ' $1').replace(/^./, func_1$2),
					containerStyle: "background-color: var(--orchestra-cardBackground-1);",
					initCollapsed: false,
					$$slots: { default: [create_default_slot$2] },
					$$scope: { ctx }
				},
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(collapsiblecontainer.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(collapsiblecontainer, target, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				const collapsiblecontainer_changes = {};
				if (dirty & /*categories*/ 1) collapsiblecontainer_changes.title = /*category*/ ctx[1].replace(/([A-Z])/g, ' $1').replace(/^./, func_1$2);

				if (dirty & /*$$scope, categories*/ 129) {
					collapsiblecontainer_changes.$$scope = { dirty, ctx };
				}

				collapsiblecontainer.$set(collapsiblecontainer_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(collapsiblecontainer.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(collapsiblecontainer.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(collapsiblecontainer, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_each_block$3.name,
			type: "each",
			source: "(15:4) {#each Object.keys(categories) as category}",
			ctx
		});

		return block;
	}

	function create_fragment$b(ctx) {
		let div;
		let current;
		let each_value = ensure_array_like_dev(Object.keys(/*categories*/ ctx[0]));
		let each_blocks = [];

		for (let i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
		}

		const out = i => transition_out(each_blocks[i], 1, 1, () => {
			each_blocks[i] = null;
		});

		const block = {
			c: function create() {
				div = element("div");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				attr_dev(div, "class", "listing-detail-containers svelte-cj44z");
				add_location(div, file$b, 13, 0, 294);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div, null);
					}
				}

				current = true;
			},
			p: function update(ctx, [dirty]) {
				if (dirty & /*Object, categories*/ 1) {
					each_value = ensure_array_like_dev(Object.keys(/*categories*/ ctx[0]));
					let i;

					for (i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$3(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(child_ctx, dirty);
							transition_in(each_blocks[i], 1);
						} else {
							each_blocks[i] = create_each_block$3(child_ctx);
							each_blocks[i].c();
							transition_in(each_blocks[i], 1);
							each_blocks[i].m(div, null);
						}
					}

					group_outros();

					for (i = each_value.length; i < each_blocks.length; i += 1) {
						out(i);
					}

					check_outros();
				}
			},
			i: function intro(local) {
				if (current) return;

				for (let i = 0; i < each_value.length; i += 1) {
					transition_in(each_blocks[i]);
				}

				current = true;
			},
			o: function outro(local) {
				each_blocks = each_blocks.filter(Boolean);

				for (let i = 0; i < each_blocks.length; i += 1) {
					transition_out(each_blocks[i]);
				}

				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
				}

				destroy_each(each_blocks, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$b.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	const func$2 = str => str.toUpperCase();
	const func_1$2 = str => str.toUpperCase();

	function instance$b($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('ListingAttributesMobile', slots, []);
		let { categories = {} } = $$props;
		const writable_props = ['categories'];

		Object_1$2.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ListingAttributesMobile> was created with unknown prop '${key}'`);
		});

		$$self.$$set = $$props => {
			if ('categories' in $$props) $$invalidate(0, categories = $$props.categories);
		};

		$$self.$capture_state = () => ({
			CollapsibleContainer,
			AttributeContent,
			categories
		});

		$$self.$inject_state = $$props => {
			if ('categories' in $$props) $$invalidate(0, categories = $$props.categories);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [categories];
	}

	class ListingAttributesMobile extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$b, create_fragment$b, safe_not_equal, { categories: 0 }, add_css$9);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "ListingAttributesMobile",
				options,
				id: create_fragment$b.name
			});
		}

		get categories() {
			return this.$$.ctx[0];
		}

		set categories(categories) {
			this.$$set({ categories });
			flush();
		}
	}

	create_custom_element(ListingAttributesMobile, {"categories":{}}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/ListingAttributes/ListingAttributesTablet.svelte generated by Svelte v4.2.18 */

	const { Object: Object_1$1 } = globals;
	const file$a = "src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/ListingAttributes/ListingAttributesTablet.svelte";

	function add_css$8(target) {
		append_styles(target, "svelte-1coodyu", ".listing-detail-tabs.svelte-1coodyu{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;width:100%;gap:10px;border-radius:8px}.tabs.svelte-1coodyu{display:grid;grid-template-columns:repeat(auto-fit, minmax(0, 1fr));justify-content:space-between;align-items:center;width:100%;border-radius:8px;background-color:var(--orchestra-accent1-1);border:1px solid var(--orchestra-borderColor)}.tab.svelte-1coodyu{display:flex;justify-content:center;align-items:center;text-align:center;padding:12px 20px;cursor:pointer;box-sizing:border-box;border-radius:8px;font-size:1rem;height:100%}.tab.selected.svelte-1coodyu{background-color:var(--orchestra-primary-3);color:white;font-weight:bold}.tab.selected.svelte-1coodyu{background-color:var(--orchestra-primary-3);color:white;font-weight:bold}.subtabs-tablet.svelte-1coodyu{width:100%}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTGlzdGluZ0F0dHJpYnV0ZXNUYWJsZXQuc3ZlbHRlIiwibWFwcGluZ3MiOiJBQWdCSSxtQ0FBcUIsQ0FDakIsT0FBTyxDQUFFLElBQUksQ0FDYixjQUFjLENBQUUsTUFBTSxDQUN0QixlQUFlLENBQUUsTUFBTSxDQUN2QixXQUFXLENBQUUsVUFBVSxDQUN2QixLQUFLLENBQUUsSUFBSSxDQUNYLEdBQUcsQ0FBRSxJQUFJLENBQ1QsYUFBYSxDQUFFLEdBQ25CLENBRUEsb0JBQU0sQ0FDRixPQUFPLENBQUUsSUFBSSxDQUNiLHFCQUFxQixDQUFFLE9BQU8sUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUN2RCxlQUFlLENBQUUsYUFBYSxDQUM5QixXQUFXLENBQUUsTUFBTSxDQUNuQixLQUFLLENBQUUsSUFBSSxDQUNYLGFBQWEsQ0FBRSxHQUFHLENBQ2xCLGdCQUFnQixDQUFFLElBQUkscUJBQXFCLENBQUMsQ0FDNUMsTUFBTSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSx1QkFBdUIsQ0FDakQsQ0FFQSxtQkFBSyxDQUNELE9BQU8sQ0FBRSxJQUFJLENBQ2IsZUFBZSxDQUFFLE1BQU0sQ0FDdkIsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsVUFBVSxDQUFFLE1BQU0sQ0FDbEIsT0FBTyxDQUFFLElBQUksQ0FBQyxJQUFJLENBQ2xCLE1BQU0sQ0FBRSxPQUFPLENBQ2YsVUFBVSxDQUFFLFVBQVUsQ0FDdEIsYUFBYSxDQUFFLEdBQUcsQ0FDbEIsU0FBUyxDQUFFLElBQUksQ0FDZixNQUFNLENBQUUsSUFDWixDQUVBLElBQUksd0JBQVUsQ0FDVixnQkFBZ0IsQ0FBRSxJQUFJLHFCQUFxQixDQUFDLENBQzVDLEtBQUssQ0FBRSxLQUFLLENBQ1osV0FBVyxDQUFFLElBQ2pCLENBRUEsSUFBSSx3QkFBVSxDQUNWLGdCQUFnQixDQUFFLElBQUkscUJBQXFCLENBQUMsQ0FDNUMsS0FBSyxDQUFFLEtBQUssQ0FDWixXQUFXLENBQUUsSUFDakIsQ0FFQSw4QkFBZ0IsQ0FDWixLQUFLLENBQUUsSUFDWCIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJMaXN0aW5nQXR0cmlidXRlc1RhYmxldC5zdmVsdGUiXX0= */");
	}

	function get_each_context$2(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[5] = list[i];
		return child_ctx;
	}

	function get_each_context_1$1(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[8] = list[i];
		return child_ctx;
	}

	// (72:8) {#each Object.keys(categories) as category}
	function create_each_block_1$1(ctx) {
		let div;
		let t0_value = /*category*/ ctx[8].replace(/([A-Z])/g, ' $1').replace(/^./, func$1) + "";
		let t0;
		let t1;
		let div_class_value;
		let mounted;
		let dispose;

		function click_handler() {
			return /*click_handler*/ ctx[3](/*category*/ ctx[8]);
		}

		const block = {
			c: function create() {
				div = element("div");
				t0 = text(t0_value);
				t1 = space();

				attr_dev(div, "class", div_class_value = "tab " + (/*selectedCategory*/ ctx[1] === /*category*/ ctx[8]
				? 'selected'
				: '') + " svelte-1coodyu");

				add_location(div, file$a, 72, 12, 1840);
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);
				append_dev(div, t0);
				append_dev(div, t1);

				if (!mounted) {
					dispose = listen_dev(div, "click", click_handler, false, false, false, false);
					mounted = true;
				}
			},
			p: function update(new_ctx, dirty) {
				ctx = new_ctx;
				if (dirty & /*categories*/ 1 && t0_value !== (t0_value = /*category*/ ctx[8].replace(/([A-Z])/g, ' $1').replace(/^./, func$1) + "")) set_data_dev(t0, t0_value);

				if (dirty & /*selectedCategory, categories*/ 3 && div_class_value !== (div_class_value = "tab " + (/*selectedCategory*/ ctx[1] === /*category*/ ctx[8]
				? 'selected'
				: '') + " svelte-1coodyu")) {
					attr_dev(div, "class", div_class_value);
				}
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
				}

				mounted = false;
				dispose();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_each_block_1$1.name,
			type: "each",
			source: "(72:8) {#each Object.keys(categories) as category}",
			ctx
		});

		return block;
	}

	// (80:12) <CollapsibleContainer title={subTab.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} initCollapsed={false}>
	function create_default_slot$1(ctx) {
		let attributecontent;
		let t;
		let current;

		attributecontent = new AttributeContent({
				props: {
					tab: /*selectedCategory*/ ctx[1],
					subTab: /*subTab*/ ctx[5]
				},
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(attributecontent.$$.fragment);
				t = space();
			},
			m: function mount(target, anchor) {
				mount_component(attributecontent, target, anchor);
				insert_dev(target, t, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				const attributecontent_changes = {};
				if (dirty & /*selectedCategory*/ 2) attributecontent_changes.tab = /*selectedCategory*/ ctx[1];
				if (dirty & /*categories, selectedCategory*/ 3) attributecontent_changes.subTab = /*subTab*/ ctx[5];
				attributecontent.$set(attributecontent_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(attributecontent.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(attributecontent.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(t);
				}

				destroy_component(attributecontent, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_default_slot$1.name,
			type: "slot",
			source: "(80:12) <CollapsibleContainer title={subTab.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} initCollapsed={false}>",
			ctx
		});

		return block;
	}

	// (79:8) {#each categories[selectedCategory] as subTab}
	function create_each_block$2(ctx) {
		let collapsiblecontainer;
		let current;

		collapsiblecontainer = new CollapsibleContainer({
				props: {
					title: /*subTab*/ ctx[5].replace(/([A-Z])/g, ' $1').replace(/^./, func_1$1),
					initCollapsed: false,
					$$slots: { default: [create_default_slot$1] },
					$$scope: { ctx }
				},
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(collapsiblecontainer.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(collapsiblecontainer, target, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				const collapsiblecontainer_changes = {};
				if (dirty & /*categories, selectedCategory*/ 3) collapsiblecontainer_changes.title = /*subTab*/ ctx[5].replace(/([A-Z])/g, ' $1').replace(/^./, func_1$1);

				if (dirty & /*$$scope, selectedCategory, categories*/ 2051) {
					collapsiblecontainer_changes.$$scope = { dirty, ctx };
				}

				collapsiblecontainer.$set(collapsiblecontainer_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(collapsiblecontainer.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(collapsiblecontainer.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(collapsiblecontainer, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_each_block$2.name,
			type: "each",
			source: "(79:8) {#each categories[selectedCategory] as subTab}",
			ctx
		});

		return block;
	}

	function create_fragment$a(ctx) {
		let div2;
		let div0;
		let t;
		let div1;
		let current;
		let each_value_1 = ensure_array_like_dev(Object.keys(/*categories*/ ctx[0]));
		let each_blocks_1 = [];

		for (let i = 0; i < each_value_1.length; i += 1) {
			each_blocks_1[i] = create_each_block_1$1(get_each_context_1$1(ctx, each_value_1, i));
		}

		let each_value = ensure_array_like_dev(/*categories*/ ctx[0][/*selectedCategory*/ ctx[1]]);
		let each_blocks = [];

		for (let i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
		}

		const out = i => transition_out(each_blocks[i], 1, 1, () => {
			each_blocks[i] = null;
		});

		const block = {
			c: function create() {
				div2 = element("div");
				div0 = element("div");

				for (let i = 0; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].c();
				}

				t = space();
				div1 = element("div");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				attr_dev(div0, "class", "tabs svelte-1coodyu");
				add_location(div0, file$a, 70, 4, 1757);
				attr_dev(div1, "class", "subtabs-tablet svelte-1coodyu");
				add_location(div1, file$a, 77, 4, 2100);
				attr_dev(div2, "class", "listing-detail-tabs svelte-1coodyu");
				add_location(div2, file$a, 69, 0, 1719);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div2, anchor);
				append_dev(div2, div0);

				for (let i = 0; i < each_blocks_1.length; i += 1) {
					if (each_blocks_1[i]) {
						each_blocks_1[i].m(div0, null);
					}
				}

				append_dev(div2, t);
				append_dev(div2, div1);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div1, null);
					}
				}

				current = true;
			},
			p: function update(ctx, [dirty]) {
				if (dirty & /*selectedCategory, Object, categories, handleCategoryChange*/ 7) {
					each_value_1 = ensure_array_like_dev(Object.keys(/*categories*/ ctx[0]));
					let i;

					for (i = 0; i < each_value_1.length; i += 1) {
						const child_ctx = get_each_context_1$1(ctx, each_value_1, i);

						if (each_blocks_1[i]) {
							each_blocks_1[i].p(child_ctx, dirty);
						} else {
							each_blocks_1[i] = create_each_block_1$1(child_ctx);
							each_blocks_1[i].c();
							each_blocks_1[i].m(div0, null);
						}
					}

					for (; i < each_blocks_1.length; i += 1) {
						each_blocks_1[i].d(1);
					}

					each_blocks_1.length = each_value_1.length;
				}

				if (dirty & /*categories, selectedCategory*/ 3) {
					each_value = ensure_array_like_dev(/*categories*/ ctx[0][/*selectedCategory*/ ctx[1]]);
					let i;

					for (i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$2(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(child_ctx, dirty);
							transition_in(each_blocks[i], 1);
						} else {
							each_blocks[i] = create_each_block$2(child_ctx);
							each_blocks[i].c();
							transition_in(each_blocks[i], 1);
							each_blocks[i].m(div1, null);
						}
					}

					group_outros();

					for (i = each_value.length; i < each_blocks.length; i += 1) {
						out(i);
					}

					check_outros();
				}
			},
			i: function intro(local) {
				if (current) return;

				for (let i = 0; i < each_value.length; i += 1) {
					transition_in(each_blocks[i]);
				}

				current = true;
			},
			o: function outro(local) {
				each_blocks = each_blocks.filter(Boolean);

				for (let i = 0; i < each_blocks.length; i += 1) {
					transition_out(each_blocks[i]);
				}

				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div2);
				}

				destroy_each(each_blocks_1, detaching);
				destroy_each(each_blocks, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$a.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	const func$1 = str => str.toUpperCase();
	const func_1$1 = str => str.toUpperCase();

	function instance$a($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('ListingAttributesTablet', slots, []);
		let selectedCategory = 'primaryResidence';
		let selectedTab = 'area';
		let { categories } = $$props;

		function handleCategoryChange(category) {
			$$invalidate(1, selectedCategory = category);
			selectedTab = categories[category][0];
		}

		$$self.$$.on_mount.push(function () {
			if (categories === undefined && !('categories' in $$props || $$self.$$.bound[$$self.$$.props['categories']])) {
				console.warn("<ListingAttributesTablet> was created without expected prop 'categories'");
			}
		});

		const writable_props = ['categories'];

		Object_1$1.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ListingAttributesTablet> was created with unknown prop '${key}'`);
		});

		const click_handler = category => handleCategoryChange(category);

		$$self.$$set = $$props => {
			if ('categories' in $$props) $$invalidate(0, categories = $$props.categories);
		};

		$$self.$capture_state = () => ({
			CollapsibleContainer,
			AttributeContent,
			selectedCategory,
			selectedTab,
			categories,
			handleCategoryChange
		});

		$$self.$inject_state = $$props => {
			if ('selectedCategory' in $$props) $$invalidate(1, selectedCategory = $$props.selectedCategory);
			if ('selectedTab' in $$props) selectedTab = $$props.selectedTab;
			if ('categories' in $$props) $$invalidate(0, categories = $$props.categories);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [categories, selectedCategory, handleCategoryChange, click_handler];
	}

	class ListingAttributesTablet extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$a, create_fragment$a, safe_not_equal, { categories: 0 }, add_css$8);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "ListingAttributesTablet",
				options,
				id: create_fragment$a.name
			});
		}

		get categories() {
			return this.$$.ctx[0];
		}

		set categories(categories) {
			this.$$set({ categories });
			flush();
		}
	}

	create_custom_element(ListingAttributesTablet, {"categories":{}}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/ListingAttributes/ListingAttributesDesktop.svelte generated by Svelte v4.2.18 */

	const { Object: Object_1 } = globals;
	const file$9 = "src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/ListingAttributes/ListingAttributesDesktop.svelte";

	function add_css$7(target) {
		append_styles(target, "svelte-zjdb4l", ".listing-detail-content.svelte-zjdb4l{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;height:100%;width:100%;gap:10px;border-radius:8px}.tabs.svelte-zjdb4l{display:grid;grid-template-columns:repeat(auto-fit, minmax(0, 1fr));justify-content:space-between;align-items:center;width:100%;border-radius:8px;background-color:var(--orchestra-accent1-1);border:1px solid var(--orchestra-borderColor)}.tab.svelte-zjdb4l,.sub-tab.svelte-zjdb4l{display:flex;justify-content:center;align-items:center;text-align:center;padding:12px 20px;cursor:pointer;box-sizing:border-box;border-radius:8px;font-size:1rem}.tab.selected.svelte-zjdb4l{background-color:var(--orchestra-primary-3);color:white;font-weight:bold}.sub-tabs.svelte-zjdb4l{display:flex;flex-direction:row;justify-content:flex-end;align-items:center;gap:5px;width:100%;border-radius:8px;padding:5px}.sub-tab.svelte-zjdb4l{padding:10px 16px;font-size:0.9rem}.sub-tab.selected.svelte-zjdb4l{background-color:var(--orchestra-secondary-3);color:var(--orchestra-textColor);font-weight:bold}.tab.selected.svelte-zjdb4l{background-color:var(--orchestra-primary-3);color:white;font-weight:bold}.sub-tab.selected.svelte-zjdb4l{background-color:var(--orchestra-secondary-3);color:var(--orchestra-textColor);font-weight:bold}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTGlzdGluZ0F0dHJpYnV0ZXNEZXNrdG9wLnN2ZWx0ZSIsIm1hcHBpbmdzIjoiQUFtQkkscUNBQXdCLENBQ3BCLE9BQU8sQ0FBRSxJQUFJLENBQ2IsY0FBYyxDQUFFLE1BQU0sQ0FDdEIsZUFBZSxDQUFFLE1BQU0sQ0FDdkIsV0FBVyxDQUFFLFVBQVUsQ0FDdkIsTUFBTSxDQUFFLElBQUksQ0FDWixLQUFLLENBQUUsSUFBSSxDQUNYLEdBQUcsQ0FBRSxJQUFJLENBQ1QsYUFBYSxDQUFFLEdBQ25CLENBRUEsbUJBQU0sQ0FDRixPQUFPLENBQUUsSUFBSSxDQUNiLHFCQUFxQixDQUFFLE9BQU8sUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUN2RCxlQUFlLENBQUUsYUFBYSxDQUM5QixXQUFXLENBQUUsTUFBTSxDQUNuQixLQUFLLENBQUUsSUFBSSxDQUNYLGFBQWEsQ0FBRSxHQUFHLENBQ2xCLGdCQUFnQixDQUFFLElBQUkscUJBQXFCLENBQUMsQ0FDNUMsTUFBTSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSx1QkFBdUIsQ0FDakQsQ0FFQSxrQkFBSSxDQUFFLHNCQUFTLENBQ1gsT0FBTyxDQUFFLElBQUksQ0FDYixlQUFlLENBQUUsTUFBTSxDQUN2QixXQUFXLENBQUUsTUFBTSxDQUNuQixVQUFVLENBQUUsTUFBTSxDQUNsQixPQUFPLENBQUUsSUFBSSxDQUFDLElBQUksQ0FDbEIsTUFBTSxDQUFFLE9BQU8sQ0FDZixVQUFVLENBQUUsVUFBVSxDQUN0QixhQUFhLENBQUUsR0FBRyxDQUNsQixTQUFTLENBQUUsSUFDZixDQUVBLElBQUksdUJBQVUsQ0FDVixnQkFBZ0IsQ0FBRSxJQUFJLHFCQUFxQixDQUFDLENBQzVDLEtBQUssQ0FBRSxLQUFLLENBQ1osV0FBVyxDQUFFLElBQ2pCLENBRUEsdUJBQVUsQ0FDTixPQUFPLENBQUUsSUFBSSxDQUNiLGNBQWMsQ0FBRSxHQUFHLENBQ25CLGVBQWUsQ0FBRSxRQUFRLENBQ3pCLFdBQVcsQ0FBRSxNQUFNLENBQ25CLEdBQUcsQ0FBRSxHQUFHLENBQ1IsS0FBSyxDQUFFLElBQUksQ0FDWCxhQUFhLENBQUUsR0FBRyxDQUNsQixPQUFPLENBQUUsR0FDYixDQUVBLHNCQUFTLENBQ0wsT0FBTyxDQUFFLElBQUksQ0FBQyxJQUFJLENBQ2xCLFNBQVMsQ0FBRSxNQUNmLENBRUEsUUFBUSx1QkFBVSxDQUNkLGdCQUFnQixDQUFFLElBQUksdUJBQXVCLENBQUMsQ0FDOUMsS0FBSyxDQUFFLElBQUkscUJBQXFCLENBQUMsQ0FDakMsV0FBVyxDQUFFLElBQ2pCLENBRUEsSUFBSSx1QkFBVSxDQUNWLGdCQUFnQixDQUFFLElBQUkscUJBQXFCLENBQUMsQ0FDNUMsS0FBSyxDQUFFLEtBQUssQ0FDWixXQUFXLENBQUUsSUFDakIsQ0FFQSxRQUFRLHVCQUFVLENBQ2QsZ0JBQWdCLENBQUUsSUFBSSx1QkFBdUIsQ0FBQyxDQUM5QyxLQUFLLENBQUUsSUFBSSxxQkFBcUIsQ0FBQyxDQUNqQyxXQUFXLENBQUUsSUFDakIiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiTGlzdGluZ0F0dHJpYnV0ZXNEZXNrdG9wLnN2ZWx0ZSJdfQ== */");
	}

	function get_each_context$1(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[7] = list[i];
		return child_ctx;
	}

	function get_each_context_1(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[10] = list[i];
		return child_ctx;
	}

	// (99:8) {#each Object.keys(categories) as category}
	function create_each_block_1(ctx) {
		let div;
		let t0_value = /*category*/ ctx[10].replace(/([A-Z])/g, ' $1').replace(/^./, func) + "";
		let t0;
		let t1;
		let div_class_value;
		let mounted;
		let dispose;

		function click_handler() {
			return /*click_handler*/ ctx[5](/*category*/ ctx[10]);
		}

		const block = {
			c: function create() {
				div = element("div");
				t0 = text(t0_value);
				t1 = space();

				attr_dev(div, "class", div_class_value = "tab " + (/*selectedCategory*/ ctx[1] === /*category*/ ctx[10]
				? 'selected'
				: '') + " svelte-zjdb4l");

				add_location(div, file$9, 99, 12, 2395);
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);
				append_dev(div, t0);
				append_dev(div, t1);

				if (!mounted) {
					dispose = listen_dev(div, "click", click_handler, false, false, false, false);
					mounted = true;
				}
			},
			p: function update(new_ctx, dirty) {
				ctx = new_ctx;
				if (dirty & /*categories*/ 1 && t0_value !== (t0_value = /*category*/ ctx[10].replace(/([A-Z])/g, ' $1').replace(/^./, func) + "")) set_data_dev(t0, t0_value);

				if (dirty & /*selectedCategory, categories*/ 3 && div_class_value !== (div_class_value = "tab " + (/*selectedCategory*/ ctx[1] === /*category*/ ctx[10]
				? 'selected'
				: '') + " svelte-zjdb4l")) {
					attr_dev(div, "class", div_class_value);
				}
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
				}

				mounted = false;
				dispose();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_each_block_1.name,
			type: "each",
			source: "(99:8) {#each Object.keys(categories) as category}",
			ctx
		});

		return block;
	}

	// (106:8) {#each categories[selectedCategory] as tab}
	function create_each_block$1(ctx) {
		let div;
		let t0_value = /*tab*/ ctx[7].replace(/([A-Z])/g, ' $1').replace(/^./, func_1) + "";
		let t0;
		let t1;
		let div_class_value;
		let mounted;
		let dispose;

		function click_handler_1() {
			return /*click_handler_1*/ ctx[6](/*tab*/ ctx[7]);
		}

		const block = {
			c: function create() {
				div = element("div");
				t0 = text(t0_value);
				t1 = space();

				attr_dev(div, "class", div_class_value = "sub-tab " + (/*selectedTab*/ ctx[2] === /*tab*/ ctx[7]
				? 'selected'
				: '') + " svelte-zjdb4l");

				add_location(div, file$9, 106, 12, 2742);
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);
				append_dev(div, t0);
				append_dev(div, t1);

				if (!mounted) {
					dispose = listen_dev(div, "click", click_handler_1, false, false, false, false);
					mounted = true;
				}
			},
			p: function update(new_ctx, dirty) {
				ctx = new_ctx;
				if (dirty & /*categories, selectedCategory*/ 3 && t0_value !== (t0_value = /*tab*/ ctx[7].replace(/([A-Z])/g, ' $1').replace(/^./, func_1) + "")) set_data_dev(t0, t0_value);

				if (dirty & /*selectedTab, categories, selectedCategory*/ 7 && div_class_value !== (div_class_value = "sub-tab " + (/*selectedTab*/ ctx[2] === /*tab*/ ctx[7]
				? 'selected'
				: '') + " svelte-zjdb4l")) {
					attr_dev(div, "class", div_class_value);
				}
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
				}

				mounted = false;
				dispose();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_each_block$1.name,
			type: "each",
			source: "(106:8) {#each categories[selectedCategory] as tab}",
			ctx
		});

		return block;
	}

	function create_fragment$9(ctx) {
		let div2;
		let div0;
		let t0;
		let div1;
		let t1;
		let attributecontent;
		let current;
		let each_value_1 = ensure_array_like_dev(Object.keys(/*categories*/ ctx[0]));
		let each_blocks_1 = [];

		for (let i = 0; i < each_value_1.length; i += 1) {
			each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
		}

		let each_value = ensure_array_like_dev(/*categories*/ ctx[0][/*selectedCategory*/ ctx[1]]);
		let each_blocks = [];

		for (let i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
		}

		attributecontent = new AttributeContent({
				props: {
					tab: /*selectedCategory*/ ctx[1],
					subTab: /*selectedTab*/ ctx[2]
				},
				$$inline: true
			});

		const block = {
			c: function create() {
				div2 = element("div");
				div0 = element("div");

				for (let i = 0; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].c();
				}

				t0 = space();
				div1 = element("div");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				t1 = space();
				create_component(attributecontent.$$.fragment);
				attr_dev(div0, "class", "tabs svelte-zjdb4l");
				add_location(div0, file$9, 97, 4, 2312);
				attr_dev(div1, "class", "sub-tabs svelte-zjdb4l");
				add_location(div1, file$9, 104, 4, 2655);
				attr_dev(div2, "class", "listing-detail-content svelte-zjdb4l");
				add_location(div2, file$9, 96, 0, 2271);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div2, anchor);
				append_dev(div2, div0);

				for (let i = 0; i < each_blocks_1.length; i += 1) {
					if (each_blocks_1[i]) {
						each_blocks_1[i].m(div0, null);
					}
				}

				append_dev(div2, t0);
				append_dev(div2, div1);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div1, null);
					}
				}

				append_dev(div2, t1);
				mount_component(attributecontent, div2, null);
				current = true;
			},
			p: function update(ctx, [dirty]) {
				if (dirty & /*selectedCategory, Object, categories, handleCategoryChange*/ 11) {
					each_value_1 = ensure_array_like_dev(Object.keys(/*categories*/ ctx[0]));
					let i;

					for (i = 0; i < each_value_1.length; i += 1) {
						const child_ctx = get_each_context_1(ctx, each_value_1, i);

						if (each_blocks_1[i]) {
							each_blocks_1[i].p(child_ctx, dirty);
						} else {
							each_blocks_1[i] = create_each_block_1(child_ctx);
							each_blocks_1[i].c();
							each_blocks_1[i].m(div0, null);
						}
					}

					for (; i < each_blocks_1.length; i += 1) {
						each_blocks_1[i].d(1);
					}

					each_blocks_1.length = each_value_1.length;
				}

				if (dirty & /*selectedTab, categories, selectedCategory, handleTabChange*/ 23) {
					each_value = ensure_array_like_dev(/*categories*/ ctx[0][/*selectedCategory*/ ctx[1]]);
					let i;

					for (i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context$1(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(child_ctx, dirty);
						} else {
							each_blocks[i] = create_each_block$1(child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(div1, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}

					each_blocks.length = each_value.length;
				}

				const attributecontent_changes = {};
				if (dirty & /*selectedCategory*/ 2) attributecontent_changes.tab = /*selectedCategory*/ ctx[1];
				if (dirty & /*selectedTab*/ 4) attributecontent_changes.subTab = /*selectedTab*/ ctx[2];
				attributecontent.$set(attributecontent_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(attributecontent.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(attributecontent.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div2);
				}

				destroy_each(each_blocks_1, detaching);
				destroy_each(each_blocks, detaching);
				destroy_component(attributecontent);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$9.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	const func = str => str.toUpperCase();
	const func_1 = str => str.toUpperCase();

	function instance$9($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('ListingAttributesDesktop', slots, []);
		let { categories } = $$props;
		let selectedCategory = 'primaryResidence';
		let selectedTab = 'area';

		function handleCategoryChange(category) {
			$$invalidate(1, selectedCategory = category);
			$$invalidate(2, selectedTab = categories[category][0]);
		}

		function handleTabChange(tab) {
			$$invalidate(2, selectedTab = tab);
		}

		$$self.$$.on_mount.push(function () {
			if (categories === undefined && !('categories' in $$props || $$self.$$.bound[$$self.$$.props['categories']])) {
				console.warn("<ListingAttributesDesktop> was created without expected prop 'categories'");
			}
		});

		const writable_props = ['categories'];

		Object_1.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ListingAttributesDesktop> was created with unknown prop '${key}'`);
		});

		const click_handler = category => handleCategoryChange(category);
		const click_handler_1 = tab => handleTabChange(tab);

		$$self.$$set = $$props => {
			if ('categories' in $$props) $$invalidate(0, categories = $$props.categories);
		};

		$$self.$capture_state = () => ({
			AttributeContent,
			categories,
			selectedCategory,
			selectedTab,
			handleCategoryChange,
			handleTabChange
		});

		$$self.$inject_state = $$props => {
			if ('categories' in $$props) $$invalidate(0, categories = $$props.categories);
			if ('selectedCategory' in $$props) $$invalidate(1, selectedCategory = $$props.selectedCategory);
			if ('selectedTab' in $$props) $$invalidate(2, selectedTab = $$props.selectedTab);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [
			categories,
			selectedCategory,
			selectedTab,
			handleCategoryChange,
			handleTabChange,
			click_handler,
			click_handler_1
		];
	}

	class ListingAttributesDesktop extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$9, create_fragment$9, safe_not_equal, { categories: 0 }, add_css$7);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "ListingAttributesDesktop",
				options,
				id: create_fragment$9.name
			});
		}

		get categories() {
			return this.$$.ctx[0];
		}

		set categories(categories) {
			this.$$set({ categories });
			flush();
		}
	}

	create_custom_element(ListingAttributesDesktop, {"categories":{}}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/ListingAttributes/ListingAttributes.svelte generated by Svelte v4.2.18 */
	const file$8 = "src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/ListingAttributes/ListingAttributes.svelte";

	function add_css$6(target) {
		append_styles(target, "svelte-mxg0fh", ".listing-details.svelte-mxg0fh{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;width:100%;height:100%;gap:10px;padding:10px;flex:2;background-color:var(--orchestra-cardBackground-2)}.mobile.svelte-mxg0fh{flex:unset;height:unset}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTGlzdGluZ0F0dHJpYnV0ZXMuc3ZlbHRlIiwibWFwcGluZ3MiOiJBQWVJLDhCQUFpQixDQUNiLE9BQU8sQ0FBRSxJQUFJLENBQ2IsY0FBYyxDQUFFLE1BQU0sQ0FDdEIsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsZUFBZSxDQUFFLFVBQVUsQ0FDM0IsS0FBSyxDQUFFLElBQUksQ0FDWCxNQUFNLENBQUUsSUFBSSxDQUNaLEdBQUcsQ0FBRSxJQUFJLENBQ1QsT0FBTyxDQUFFLElBQUksQ0FDYixJQUFJLENBQUUsQ0FBQyxDQUNQLGdCQUFnQixDQUFFLElBQUksNEJBQTRCLENBQ3RELENBRUEscUJBQVEsQ0FDSixJQUFJLENBQUUsS0FBSyxDQUNYLE1BQU0sQ0FBRSxLQUNaIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbIkxpc3RpbmdBdHRyaWJ1dGVzLnN2ZWx0ZSJdfQ== */");
	}

	// (40:4) {:else}
	function create_else_block$3(ctx) {
		let listingattributesdesktop;
		let current;

		listingattributesdesktop = new ListingAttributesDesktop({
				props: { categories: /*categories*/ ctx[1] },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(listingattributesdesktop.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(listingattributesdesktop, target, anchor);
				current = true;
			},
			p: noop$3,
			i: function intro(local) {
				if (current) return;
				transition_in(listingattributesdesktop.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(listingattributesdesktop.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(listingattributesdesktop, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block$3.name,
			type: "else",
			source: "(40:4) {:else}",
			ctx
		});

		return block;
	}

	// (38:40) 
	function create_if_block_1$2(ctx) {
		let listingattributestablet;
		let current;

		listingattributestablet = new ListingAttributesTablet({
				props: { categories: /*categories*/ ctx[1] },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(listingattributestablet.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(listingattributestablet, target, anchor);
				current = true;
			},
			p: noop$3,
			i: function intro(local) {
				if (current) return;
				transition_in(listingattributestablet.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(listingattributestablet.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(listingattributestablet, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_1$2.name,
			type: "if",
			source: "(38:40) ",
			ctx
		});

		return block;
	}

	// (36:4) {#if $previewSize === 'mobile'}
	function create_if_block$3(ctx) {
		let listingattributesmobile;
		let current;

		listingattributesmobile = new ListingAttributesMobile({
				props: { categories: /*categories*/ ctx[1] },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(listingattributesmobile.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(listingattributesmobile, target, anchor);
				current = true;
			},
			p: noop$3,
			i: function intro(local) {
				if (current) return;
				transition_in(listingattributesmobile.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(listingattributesmobile.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(listingattributesmobile, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$3.name,
			type: "if",
			source: "(36:4) {#if $previewSize === 'mobile'}",
			ctx
		});

		return block;
	}

	function create_fragment$8(ctx) {
		let div;
		let current_block_type_index;
		let if_block;
		let div_class_value;
		let current;
		const if_block_creators = [create_if_block$3, create_if_block_1$2, create_else_block$3];
		const if_blocks = [];

		function select_block_type(ctx, dirty) {
			if (/*$previewSize*/ ctx[0] === 'mobile') return 0;
			if (/*$previewSize*/ ctx[0] === 'tablet') return 1;
			return 2;
		}

		current_block_type_index = select_block_type(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

		const block = {
			c: function create() {
				div = element("div");
				if_block.c();
				attr_dev(div, "class", div_class_value = "" + (null_to_empty(`listing-details ${/*$previewSize*/ ctx[0]}`) + " svelte-mxg0fh"));
				add_location(div, file$8, 34, 0, 1044);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);
				if_blocks[current_block_type_index].m(div, null);
				current = true;
			},
			p: function update(ctx, [dirty]) {
				let previous_block_index = current_block_type_index;
				current_block_type_index = select_block_type(ctx);

				if (current_block_type_index === previous_block_index) {
					if_blocks[current_block_type_index].p(ctx, dirty);
				} else {
					group_outros();

					transition_out(if_blocks[previous_block_index], 1, 1, () => {
						if_blocks[previous_block_index] = null;
					});

					check_outros();
					if_block = if_blocks[current_block_type_index];

					if (!if_block) {
						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
						if_block.c();
					} else {
						if_block.p(ctx, dirty);
					}

					transition_in(if_block, 1);
					if_block.m(div, null);
				}

				if (!current || dirty & /*$previewSize*/ 1 && div_class_value !== (div_class_value = "" + (null_to_empty(`listing-details ${/*$previewSize*/ ctx[0]}`) + " svelte-mxg0fh"))) {
					attr_dev(div, "class", div_class_value);
				}
			},
			i: function intro(local) {
				if (current) return;
				transition_in(if_block);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
				}

				if_blocks[current_block_type_index].d();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$8.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$8($$self, $$props, $$invalidate) {
		let $previewSize;
		validate_store(previewSize, 'previewSize');
		component_subscribe($$self, previewSize, $$value => $$invalidate(0, $previewSize = $$value));
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('ListingAttributes', slots, []);

		const categories = {
			primaryResidence: ['inside', 'outside', 'nearby', 'area'],
			rentalProperty: ['market', 'overhead', 'maintenance', 'tenants'],
			vacationRental: ['seasonality', 'nearbyAttractions', 'majorEvents', 'restrictions'],
			remodel: ['foundation', 'roof', 'interior', 'exterior', 'outdoor', 'permits']
		};

		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ListingAttributes> was created with unknown prop '${key}'`);
		});

		$$self.$capture_state = () => ({
			previewSize,
			ListingAttributesMobile,
			ListingAttributesTablet,
			ListingAttributesDesktop,
			categories,
			$previewSize
		});

		return [$previewSize, categories];
	}

	class ListingAttributes extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$8, create_fragment$8, safe_not_equal, {}, add_css$6);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "ListingAttributes",
				options,
				id: create_fragment$8.name
			});
		}
	}

	create_custom_element(ListingAttributes, {}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/PropertyCard.svelte generated by Svelte v4.2.18 */
	const file$7 = "src/orchestraUi/DevTools/SiteDesignPreview/PropertyDetail/PropertyCard.svelte";

	function add_css$5(target) {
		append_styles(target, "svelte-12rnpb2", ".listing-detail-container.svelte-12rnpb2{display:flex;flex-direction:column;height:100%;width:100%}.listing-detail-card.svelte-12rnpb2{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:center;height:100%;border-radius:8px;background-color:var(--orchestra-cardBackground-1);overflow-x:hidden}.listing-summary.svelte-12rnpb2{flex:1;display:flex;flex-direction:column;justify-content:space-between;align-items:center;gap:20px;height:100%;padding:10px;background-color:var(--orchestra-cardBackground-2)}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHJvcGVydHlDYXJkLnN2ZWx0ZSIsIm1hcHBpbmdzIjoiQUF3Q0ksd0NBQTBCLENBQ3RCLE9BQU8sQ0FBRSxJQUFJLENBQ2IsY0FBYyxDQUFFLE1BQU0sQ0FDdEIsTUFBTSxDQUFFLElBQUksQ0FDWixLQUFLLENBQUUsSUFDWCxDQUVBLG1DQUFxQixDQUNqQixPQUFPLENBQUUsSUFBSSxDQUNiLFNBQVMsQ0FBRSxJQUFJLENBQ2YsV0FBVyxDQUFFLFVBQVUsQ0FDdkIsZUFBZSxDQUFFLE1BQU0sQ0FDdkIsTUFBTSxDQUFFLElBQUksQ0FDWixhQUFhLENBQUUsR0FBRyxDQUNsQixnQkFBZ0IsQ0FBRSxJQUFJLDRCQUE0QixDQUFDLENBQ25ELFVBQVUsQ0FBRSxNQUNoQixDQUVBLCtCQUFpQixDQUNiLElBQUksQ0FBRSxDQUFDLENBQ1AsT0FBTyxDQUFFLElBQUksQ0FDYixjQUFjLENBQUUsTUFBTSxDQUN0QixlQUFlLENBQUUsYUFBYSxDQUM5QixXQUFXLENBQUUsTUFBTSxDQUNuQixHQUFHLENBQUUsSUFBSSxDQUNULE1BQU0sQ0FBRSxJQUFJLENBQ1osT0FBTyxDQUFFLElBQUksQ0FDYixnQkFBZ0IsQ0FBRSxJQUFJLDRCQUE0QixDQUN0RCIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJQcm9wZXJ0eUNhcmQuc3ZlbHRlIl19 */");
	}

	function create_fragment$7(ctx) {
		let div2;
		let listingtoolbar;
		let t0;
		let div1;
		let div0;
		let propertyinfoheader;
		let t1;
		let propertyimage;
		let t2;
		let moreimagesgrid;
		let t3;
		let propertymatchsummary;
		let t4;
		let listingattributes;
		let current;
		listingtoolbar = new ListingToolbar({ $$inline: true });
		propertyinfoheader = new PropertyInfoHeader({ $$inline: true });

		propertyimage = new PropertyImage({
				props: {
					placeholderImage: /*placeholderImage*/ ctx[0]
				},
				$$inline: true
			});

		moreimagesgrid = new MoreImagesGrid({
				props: {
					placeholderImage: /*placeholderImage*/ ctx[0]
				},
				$$inline: true
			});

		propertymatchsummary = new PropertyMatchSummary({ $$inline: true });
		listingattributes = new ListingAttributes({ $$inline: true });

		const block = {
			c: function create() {
				div2 = element("div");
				create_component(listingtoolbar.$$.fragment);
				t0 = space();
				div1 = element("div");
				div0 = element("div");
				create_component(propertyinfoheader.$$.fragment);
				t1 = space();
				create_component(propertyimage.$$.fragment);
				t2 = space();
				create_component(moreimagesgrid.$$.fragment);
				t3 = space();
				create_component(propertymatchsummary.$$.fragment);
				t4 = space();
				create_component(listingattributes.$$.fragment);
				attr_dev(div0, "class", "listing-summary svelte-12rnpb2");
				add_location(div0, file$7, 74, 8, 2251);
				attr_dev(div1, "class", "listing-detail-card svelte-12rnpb2");
				add_location(div1, file$7, 73, 4, 2209);
				attr_dev(div2, "class", "listing-detail-container svelte-12rnpb2");
				add_location(div2, file$7, 71, 0, 2106);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div2, anchor);
				mount_component(listingtoolbar, div2, null);
				append_dev(div2, t0);
				append_dev(div2, div1);
				append_dev(div1, div0);
				mount_component(propertyinfoheader, div0, null);
				append_dev(div0, t1);
				mount_component(propertyimage, div0, null);
				append_dev(div0, t2);
				mount_component(moreimagesgrid, div0, null);
				append_dev(div0, t3);
				mount_component(propertymatchsummary, div0, null);
				append_dev(div1, t4);
				mount_component(listingattributes, div1, null);
				/*div2_binding*/ ctx[2](div2);
				current = true;
			},
			p: function update(ctx, [dirty]) {
				const propertyimage_changes = {};
				if (dirty & /*placeholderImage*/ 1) propertyimage_changes.placeholderImage = /*placeholderImage*/ ctx[0];
				propertyimage.$set(propertyimage_changes);
				const moreimagesgrid_changes = {};
				if (dirty & /*placeholderImage*/ 1) moreimagesgrid_changes.placeholderImage = /*placeholderImage*/ ctx[0];
				moreimagesgrid.$set(moreimagesgrid_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(listingtoolbar.$$.fragment, local);
				transition_in(propertyinfoheader.$$.fragment, local);
				transition_in(propertyimage.$$.fragment, local);
				transition_in(moreimagesgrid.$$.fragment, local);
				transition_in(propertymatchsummary.$$.fragment, local);
				transition_in(listingattributes.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(listingtoolbar.$$.fragment, local);
				transition_out(propertyinfoheader.$$.fragment, local);
				transition_out(propertyimage.$$.fragment, local);
				transition_out(moreimagesgrid.$$.fragment, local);
				transition_out(propertymatchsummary.$$.fragment, local);
				transition_out(listingattributes.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div2);
				}

				destroy_component(listingtoolbar);
				destroy_component(propertyinfoheader);
				destroy_component(propertyimage);
				destroy_component(moreimagesgrid);
				destroy_component(propertymatchsummary);
				destroy_component(listingattributes);
				/*div2_binding*/ ctx[2](null);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$7.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$7($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('PropertyCard', slots, []);
		let { placeholderImage } = $$props;
		let listingAttributesElement;

		onMount(() => {
			const resizeObserver = new ResizeObserver(entries => {
					for (let entry of entries) {
						const width = entry.contentRect.width;

						// Define breakpoints for mobile, tablet, and desktop
						if (width < 600) {
							previewSize.set('mobile');
						} else if (width >= 600 && width < 1024) {
							previewSize.set('tablet');
						} else {
							previewSize.set('desktop');
						}
					}
				});

			if (listingAttributesElement) {
				resizeObserver.observe(listingAttributesElement);
			}

			return () => resizeObserver.disconnect();
		});

		$$self.$$.on_mount.push(function () {
			if (placeholderImage === undefined && !('placeholderImage' in $$props || $$self.$$.bound[$$self.$$.props['placeholderImage']])) {
				console.warn("<PropertyCard> was created without expected prop 'placeholderImage'");
			}
		});

		const writable_props = ['placeholderImage'];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<PropertyCard> was created with unknown prop '${key}'`);
		});

		function div2_binding($$value) {
			binding_callbacks[$$value ? 'unshift' : 'push'](() => {
				listingAttributesElement = $$value;
				$$invalidate(1, listingAttributesElement);
			});
		}

		$$self.$$set = $$props => {
			if ('placeholderImage' in $$props) $$invalidate(0, placeholderImage = $$props.placeholderImage);
		};

		$$self.$capture_state = () => ({
			onMount,
			previewSize,
			ListingToolbar,
			PropertyInfoHeader,
			PropertyImage,
			MoreImagesGrid,
			PropertyMatchSummary,
			ListingAttributes,
			placeholderImage,
			listingAttributesElement
		});

		$$self.$inject_state = $$props => {
			if ('placeholderImage' in $$props) $$invalidate(0, placeholderImage = $$props.placeholderImage);
			if ('listingAttributesElement' in $$props) $$invalidate(1, listingAttributesElement = $$props.listingAttributesElement);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [placeholderImage, listingAttributesElement, div2_binding];
	}

	class PropertyCard extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$7, create_fragment$7, safe_not_equal, { placeholderImage: 0 }, add_css$5);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "PropertyCard",
				options,
				id: create_fragment$7.name
			});
		}

		get placeholderImage() {
			return this.$$.ctx[0];
		}

		set placeholderImage(placeholderImage) {
			this.$$set({ placeholderImage });
			flush();
		}
	}

	create_custom_element(PropertyCard, {"placeholderImage":{}}, [], [], true);

	/* src/components/layout/EmptyState/EmptyState.svelte generated by Svelte v4.2.18 */
	const file$6 = "src/components/layout/EmptyState/EmptyState.svelte";

	function add_css$4(target) {
		append_styles(target, "svelte-5pc1gn", ".empty-state.svelte-5pc1gn{display:flex;justify-content:var(--justifyContent);align-items:var(--alignItems);font-size:var(--fontSize);font-style:var(--fontStyle);text-align:var(--textAlign);background-color:var(--backgroundColor);border:var(--border);padding:var(--padding);margin:var(--margin);color:var(--color);width:var(--width)}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRW1wdHlTdGF0ZS5zdmVsdGUiLCJtYXBwaW5ncyI6IkFBaUJJLDBCQUFhLENBQ1QsT0FBTyxDQUFFLElBQUksQ0FDYixlQUFlLENBQUUsSUFBSSxnQkFBZ0IsQ0FBQyxDQUN0QyxXQUFXLENBQUUsSUFBSSxZQUFZLENBQUMsQ0FDOUIsU0FBUyxDQUFFLElBQUksVUFBVSxDQUFDLENBQzFCLFVBQVUsQ0FBRSxJQUFJLFdBQVcsQ0FBQyxDQUM1QixVQUFVLENBQUUsSUFBSSxXQUFXLENBQUMsQ0FDNUIsZ0JBQWdCLENBQUUsSUFBSSxpQkFBaUIsQ0FBQyxDQUN4QyxNQUFNLENBQUUsSUFBSSxRQUFRLENBQUMsQ0FDckIsT0FBTyxDQUFFLElBQUksU0FBUyxDQUFDLENBQ3ZCLE1BQU0sQ0FBRSxJQUFJLFFBQVEsQ0FBQyxDQUNyQixLQUFLLENBQUUsSUFBSSxPQUFPLENBQUMsQ0FDbkIsS0FBSyxDQUFFLElBQUksT0FBTyxDQUN0QiIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJFbXB0eVN0YXRlLnN2ZWx0ZSJdfQ== */");
	}

	function create_fragment$6(ctx) {
		let div;
		let t;

		const block = {
			c: function create() {
				div = element("div");
				t = text(/*message*/ ctx[0]);
				attr_dev(div, "class", "empty-state svelte-5pc1gn");
				set_style(div, "--justifyContent", /*justifyContent*/ ctx[8]);
				set_style(div, "--alignItems", /*alignItems*/ ctx[9]);
				set_style(div, "--fontSize", /*fontSize*/ ctx[2]);
				set_style(div, "--fontStyle", /*fontStyle*/ ctx[3]);
				set_style(div, "--textAlign", /*textAlign*/ ctx[4]);
				set_style(div, "--backgroundColor", /*backgroundColor*/ ctx[1]);
				set_style(div, "--border", /*border*/ ctx[10]);
				set_style(div, "--padding", /*padding*/ ctx[6]);
				set_style(div, "--margin", /*margin*/ ctx[7]);
				set_style(div, "--color", /*color*/ ctx[5]);
				set_style(div, "--width", /*width*/ ctx[11]);
				add_location(div, file$6, 33, 0, 963);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, div, anchor);
				append_dev(div, t);
			},
			p: function update(ctx, [dirty]) {
				if (dirty & /*message*/ 1) set_data_dev(t, /*message*/ ctx[0]);

				if (dirty & /*justifyContent*/ 256) {
					set_style(div, "--justifyContent", /*justifyContent*/ ctx[8]);
				}

				if (dirty & /*alignItems*/ 512) {
					set_style(div, "--alignItems", /*alignItems*/ ctx[9]);
				}

				if (dirty & /*fontSize*/ 4) {
					set_style(div, "--fontSize", /*fontSize*/ ctx[2]);
				}

				if (dirty & /*fontStyle*/ 8) {
					set_style(div, "--fontStyle", /*fontStyle*/ ctx[3]);
				}

				if (dirty & /*textAlign*/ 16) {
					set_style(div, "--textAlign", /*textAlign*/ ctx[4]);
				}

				if (dirty & /*backgroundColor*/ 2) {
					set_style(div, "--backgroundColor", /*backgroundColor*/ ctx[1]);
				}

				if (dirty & /*border*/ 1024) {
					set_style(div, "--border", /*border*/ ctx[10]);
				}

				if (dirty & /*padding*/ 64) {
					set_style(div, "--padding", /*padding*/ ctx[6]);
				}

				if (dirty & /*margin*/ 128) {
					set_style(div, "--margin", /*margin*/ ctx[7]);
				}

				if (dirty & /*color*/ 32) {
					set_style(div, "--color", /*color*/ ctx[5]);
				}

				if (dirty & /*width*/ 2048) {
					set_style(div, "--width", /*width*/ ctx[11]);
				}
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$6.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$6($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('EmptyState', slots, []);
		let { message = "Nothing to show here." } = $$props;
		let { backgroundColor = "transparent" } = $$props;
		let { fontSize = "0.8rem" } = $$props;
		let { fontStyle = "italic" } = $$props;
		let { textAlign = "center" } = $$props;
		let { color = "var(--orchestra-textColor)" } = $$props;
		let { padding = "20px" } = $$props;
		let { margin = "20px" } = $$props;
		let { justifyContent = "center" } = $$props;
		let { alignItems = "center" } = $$props;
		let { border = "none" } = $$props;
		let { width = "100%" } = $$props;

		const writable_props = [
			'message',
			'backgroundColor',
			'fontSize',
			'fontStyle',
			'textAlign',
			'color',
			'padding',
			'margin',
			'justifyContent',
			'alignItems',
			'border',
			'width'
		];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<EmptyState> was created with unknown prop '${key}'`);
		});

		$$self.$$set = $$props => {
			if ('message' in $$props) $$invalidate(0, message = $$props.message);
			if ('backgroundColor' in $$props) $$invalidate(1, backgroundColor = $$props.backgroundColor);
			if ('fontSize' in $$props) $$invalidate(2, fontSize = $$props.fontSize);
			if ('fontStyle' in $$props) $$invalidate(3, fontStyle = $$props.fontStyle);
			if ('textAlign' in $$props) $$invalidate(4, textAlign = $$props.textAlign);
			if ('color' in $$props) $$invalidate(5, color = $$props.color);
			if ('padding' in $$props) $$invalidate(6, padding = $$props.padding);
			if ('margin' in $$props) $$invalidate(7, margin = $$props.margin);
			if ('justifyContent' in $$props) $$invalidate(8, justifyContent = $$props.justifyContent);
			if ('alignItems' in $$props) $$invalidate(9, alignItems = $$props.alignItems);
			if ('border' in $$props) $$invalidate(10, border = $$props.border);
			if ('width' in $$props) $$invalidate(11, width = $$props.width);
		};

		$$self.$capture_state = () => ({
			message,
			backgroundColor,
			fontSize,
			fontStyle,
			textAlign,
			color,
			padding,
			margin,
			justifyContent,
			alignItems,
			border,
			width
		});

		$$self.$inject_state = $$props => {
			if ('message' in $$props) $$invalidate(0, message = $$props.message);
			if ('backgroundColor' in $$props) $$invalidate(1, backgroundColor = $$props.backgroundColor);
			if ('fontSize' in $$props) $$invalidate(2, fontSize = $$props.fontSize);
			if ('fontStyle' in $$props) $$invalidate(3, fontStyle = $$props.fontStyle);
			if ('textAlign' in $$props) $$invalidate(4, textAlign = $$props.textAlign);
			if ('color' in $$props) $$invalidate(5, color = $$props.color);
			if ('padding' in $$props) $$invalidate(6, padding = $$props.padding);
			if ('margin' in $$props) $$invalidate(7, margin = $$props.margin);
			if ('justifyContent' in $$props) $$invalidate(8, justifyContent = $$props.justifyContent);
			if ('alignItems' in $$props) $$invalidate(9, alignItems = $$props.alignItems);
			if ('border' in $$props) $$invalidate(10, border = $$props.border);
			if ('width' in $$props) $$invalidate(11, width = $$props.width);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [
			message,
			backgroundColor,
			fontSize,
			fontStyle,
			textAlign,
			color,
			padding,
			margin,
			justifyContent,
			alignItems,
			border,
			width
		];
	}

	class EmptyState extends SvelteComponentDev {
		constructor(options) {
			super(options);

			init(
				this,
				options,
				instance$6,
				create_fragment$6,
				safe_not_equal,
				{
					message: 0,
					backgroundColor: 1,
					fontSize: 2,
					fontStyle: 3,
					textAlign: 4,
					color: 5,
					padding: 6,
					margin: 7,
					justifyContent: 8,
					alignItems: 9,
					border: 10,
					width: 11
				},
				add_css$4
			);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "EmptyState",
				options,
				id: create_fragment$6.name
			});
		}

		get message() {
			return this.$$.ctx[0];
		}

		set message(message) {
			this.$$set({ message });
			flush();
		}

		get backgroundColor() {
			return this.$$.ctx[1];
		}

		set backgroundColor(backgroundColor) {
			this.$$set({ backgroundColor });
			flush();
		}

		get fontSize() {
			return this.$$.ctx[2];
		}

		set fontSize(fontSize) {
			this.$$set({ fontSize });
			flush();
		}

		get fontStyle() {
			return this.$$.ctx[3];
		}

		set fontStyle(fontStyle) {
			this.$$set({ fontStyle });
			flush();
		}

		get textAlign() {
			return this.$$.ctx[4];
		}

		set textAlign(textAlign) {
			this.$$set({ textAlign });
			flush();
		}

		get color() {
			return this.$$.ctx[5];
		}

		set color(color) {
			this.$$set({ color });
			flush();
		}

		get padding() {
			return this.$$.ctx[6];
		}

		set padding(padding) {
			this.$$set({ padding });
			flush();
		}

		get margin() {
			return this.$$.ctx[7];
		}

		set margin(margin) {
			this.$$set({ margin });
			flush();
		}

		get justifyContent() {
			return this.$$.ctx[8];
		}

		set justifyContent(justifyContent) {
			this.$$set({ justifyContent });
			flush();
		}

		get alignItems() {
			return this.$$.ctx[9];
		}

		set alignItems(alignItems) {
			this.$$set({ alignItems });
			flush();
		}

		get border() {
			return this.$$.ctx[10];
		}

		set border(border) {
			this.$$set({ border });
			flush();
		}

		get width() {
			return this.$$.ctx[11];
		}

		set width(width) {
			this.$$set({ width });
			flush();
		}
	}

	create_custom_element(EmptyState, {"message":{},"backgroundColor":{},"fontSize":{},"fontStyle":{},"textAlign":{},"color":{},"padding":{},"margin":{},"justifyContent":{},"alignItems":{},"border":{},"width":{}}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/Section/SectionListings.svelte generated by Svelte v4.2.18 */
	const file$5 = "src/orchestraUi/DevTools/SiteDesignPreview/Section/SectionListings.svelte";

	function get_each_context(ctx, list, i) {
		const child_ctx = ctx.slice();
		child_ctx[4] = list[i];
		return child_ctx;
	}

	// (33:20) {:else}
	function create_else_block_1$1(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder Image");
				add_location(img, file$5, 33, 24, 1245);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			p: noop$3,
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block_1$1.name,
			type: "else",
			source: "(33:20) {:else}",
			ctx
		});

		return block;
	}

	// (31:44) 
	function create_if_block_2$1(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = /*listing*/ ctx[4].image)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder Image");
				add_location(img, file$5, 31, 24, 1141);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			p: function update(ctx, dirty) {
				if (dirty & /*$listings*/ 1 && !src_url_equal(img.src, img_src_value = /*listing*/ ctx[4].image)) {
					attr_dev(img, "src", img_src_value);
				}
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_2$1.name,
			type: "if",
			source: "(31:44) ",
			ctx
		});

		return block;
	}

	// (29:20) {#if listing.image && listing.image?.ext_src}
	function create_if_block_1$1(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: /*listing*/ ctx[4].image },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				const image_changes = {};
				if (dirty & /*$listings*/ 1) image_changes.image = /*listing*/ ctx[4].image;
				image.$set(image_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_1$1.name,
			type: "if",
			source: "(29:20) {#if listing.image && listing.image?.ext_src}",
			ctx
		});

		return block;
	}

	// (27:12) {#each $listings.slice(0, maxListings) as listing}
	function create_each_block(ctx) {
		let div1;
		let current_block_type_index;
		let if_block;
		let t0;
		let div0;
		let p;
		let t1_value = /*listing*/ ctx[4].description + "";
		let t1;
		let t2;
		let current;
		let mounted;
		let dispose;
		const if_block_creators = [create_if_block_1$1, create_if_block_2$1, create_else_block_1$1];
		const if_blocks = [];

		function select_block_type(ctx, dirty) {
			if (/*listing*/ ctx[4].image && /*listing*/ ctx[4].image?.ext_src) return 0;
			if (/*listing*/ ctx[4].image) return 1;
			return 2;
		}

		current_block_type_index = select_block_type(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

		function click_handler() {
			return /*click_handler*/ ctx[3](/*listing*/ ctx[4]);
		}

		const block = {
			c: function create() {
				div1 = element("div");
				if_block.c();
				t0 = space();
				div0 = element("div");
				p = element("p");
				t1 = text(t1_value);
				t2 = space();
				attr_dev(p, "class", "listing-description");
				add_location(p, file$5, 37, 24, 1477);
				attr_dev(div0, "class", "listing-data");
				add_location(div0, file$5, 35, 20, 1346);
				attr_dev(div1, "class", "listing");
				add_location(div1, file$5, 27, 16, 888);
			},
			m: function mount(target, anchor) {
				insert_dev(target, div1, anchor);
				if_blocks[current_block_type_index].m(div1, null);
				append_dev(div1, t0);
				append_dev(div1, div0);
				append_dev(div0, p);
				append_dev(p, t1);
				append_dev(div1, t2);
				current = true;

				if (!mounted) {
					dispose = listen_dev(div1, "click", click_handler, false, false, false, false);
					mounted = true;
				}
			},
			p: function update(new_ctx, dirty) {
				ctx = new_ctx;
				let previous_block_index = current_block_type_index;
				current_block_type_index = select_block_type(ctx);

				if (current_block_type_index === previous_block_index) {
					if_blocks[current_block_type_index].p(ctx, dirty);
				} else {
					group_outros();

					transition_out(if_blocks[previous_block_index], 1, 1, () => {
						if_blocks[previous_block_index] = null;
					});

					check_outros();
					if_block = if_blocks[current_block_type_index];

					if (!if_block) {
						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
						if_block.c();
					} else {
						if_block.p(ctx, dirty);
					}

					transition_in(if_block, 1);
					if_block.m(div1, t0);
				}

				if ((!current || dirty & /*$listings*/ 1) && t1_value !== (t1_value = /*listing*/ ctx[4].description + "")) set_data_dev(t1, t1_value);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(if_block);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(div1);
				}

				if_blocks[current_block_type_index].d();
				mounted = false;
				dispose();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_each_block.name,
			type: "each",
			source: "(27:12) {#each $listings.slice(0, maxListings) as listing}",
			ctx
		});

		return block;
	}

	// (46:12) {:else}
	function create_else_block$2(ctx) {
		let emptystate;
		let current;

		emptystate = new EmptyState({
				props: {
					message: "Select a listing to view details"
				},
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(emptystate.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(emptystate, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(emptystate.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(emptystate.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(emptystate, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block$2.name,
			type: "else",
			source: "(46:12) {:else}",
			ctx
		});

		return block;
	}

	// (44:12) {#if $selectedListing}
	function create_if_block$2(ctx) {
		let propertycard;
		let current;

		propertycard = new PropertyCard({
				props: { placeholderImage },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(propertycard.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(propertycard, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(propertycard.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(propertycard.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(propertycard, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$2.name,
			type: "if",
			source: "(44:12) {#if $selectedListing}",
			ctx
		});

		return block;
	}

	function create_fragment$5(ctx) {
		let section;
		let h2;
		let t1;
		let p;
		let t3;
		let div2;
		let div0;
		let t4;
		let div1;
		let current_block_type_index;
		let if_block;
		let current;
		let each_value = ensure_array_like_dev(/*$listings*/ ctx[0].slice(0, maxListings));
		let each_blocks = [];

		for (let i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
		}

		const out = i => transition_out(each_blocks[i], 1, 1, () => {
			each_blocks[i] = null;
		});

		const if_block_creators = [create_if_block$2, create_else_block$2];
		const if_blocks = [];

		function select_block_type_1(ctx, dirty) {
			if (/*$selectedListing*/ ctx[2]) return 0;
			return 1;
		}

		current_block_type_index = select_block_type_1(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

		const block = {
			c: function create() {
				section = element("section");
				h2 = element("h2");
				h2.textContent = `${listingsSection.name}`;
				t1 = space();
				p = element("p");
				p.textContent = `${listingsSection.description}`;
				t3 = space();
				div2 = element("div");
				div0 = element("div");

				for (let i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				t4 = space();
				div1 = element("div");
				if_block.c();
				add_location(h2, file$5, 22, 4, 673);
				add_location(p, file$5, 23, 4, 709);
				attr_dev(div0, "class", "listings-grid");
				add_location(div0, file$5, 25, 8, 781);
				attr_dev(div1, "class", "listing-detail-selected");
				toggle_class(div1, "show", /*$showDetail*/ ctx[1]);
				add_location(div1, file$5, 42, 8, 1627);
				attr_dev(div2, "class", "listings");
				add_location(div2, file$5, 24, 4, 750);
				attr_dev(section, "class", "section listings-section");
				add_location(section, file$5, 21, 0, 626);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, section, anchor);
				append_dev(section, h2);
				append_dev(section, t1);
				append_dev(section, p);
				append_dev(section, t3);
				append_dev(section, div2);
				append_dev(div2, div0);

				for (let i = 0; i < each_blocks.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].m(div0, null);
					}
				}

				append_dev(div2, t4);
				append_dev(div2, div1);
				if_blocks[current_block_type_index].m(div1, null);
				current = true;
			},
			p: function update(ctx, [dirty]) {
				if (dirty & /*$listings*/ 1) {
					each_value = ensure_array_like_dev(/*$listings*/ ctx[0].slice(0, maxListings));
					let i;

					for (i = 0; i < each_value.length; i += 1) {
						const child_ctx = get_each_context(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(child_ctx, dirty);
							transition_in(each_blocks[i], 1);
						} else {
							each_blocks[i] = create_each_block(child_ctx);
							each_blocks[i].c();
							transition_in(each_blocks[i], 1);
							each_blocks[i].m(div0, null);
						}
					}

					group_outros();

					for (i = each_value.length; i < each_blocks.length; i += 1) {
						out(i);
					}

					check_outros();
				}

				let previous_block_index = current_block_type_index;
				current_block_type_index = select_block_type_1(ctx);

				if (current_block_type_index !== previous_block_index) {
					group_outros();

					transition_out(if_blocks[previous_block_index], 1, 1, () => {
						if_blocks[previous_block_index] = null;
					});

					check_outros();
					if_block = if_blocks[current_block_type_index];

					if (!if_block) {
						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
						if_block.c();
					}

					transition_in(if_block, 1);
					if_block.m(div1, null);
				}

				if (!current || dirty & /*$showDetail*/ 2) {
					toggle_class(div1, "show", /*$showDetail*/ ctx[1]);
				}
			},
			i: function intro(local) {
				if (current) return;

				for (let i = 0; i < each_value.length; i += 1) {
					transition_in(each_blocks[i]);
				}

				transition_in(if_block);
				current = true;
			},
			o: function outro(local) {
				each_blocks = each_blocks.filter(Boolean);

				for (let i = 0; i < each_blocks.length; i += 1) {
					transition_out(each_blocks[i]);
				}

				transition_out(if_block);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(section);
				}

				destroy_each(each_blocks, detaching);
				if_blocks[current_block_type_index].d();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$5.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$5($$self, $$props, $$invalidate) {
		let $listings;
		let $showDetail;
		let $selectedListing;
		validate_store(listings, 'listings');
		component_subscribe($$self, listings, $$value => $$invalidate(0, $listings = $$value));
		validate_store(showDetail, 'showDetail');
		component_subscribe($$self, showDetail, $$value => $$invalidate(1, $showDetail = $$value));
		validate_store(selectedListing, 'selectedListing');
		component_subscribe($$self, selectedListing, $$value => $$invalidate(2, $selectedListing = $$value));
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('SectionListings', slots, []);
		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<SectionListings> was created with unknown prop '${key}'`);
		});

		const click_handler = listing => selectListing(listing);

		$$self.$capture_state = () => ({
			listings,
			selectedListing,
			showDetail,
			placeholderImage,
			maxListings,
			listingsSection,
			selectListing,
			PropertyCard,
			Image,
			EmptyState,
			$listings,
			$showDetail,
			$selectedListing
		});

		return [$listings, $showDetail, $selectedListing, click_handler];
	}

	class SectionListings extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$5, create_fragment$5, safe_not_equal, {});

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "SectionListings",
				options,
				id: create_fragment$5.name
			});
		}
	}

	create_custom_element(SectionListings, {}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/Section/SectionAgent.svelte generated by Svelte v4.2.18 */
	const file$4 = "src/orchestraUi/DevTools/SiteDesignPreview/Section/SectionAgent.svelte";

	function add_css$3(target) {
		append_styles(target, "svelte-749azb", ".agent-activities.svelte-749azb.svelte-749azb{display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:10px;justify-content:flex-start;align-items:center;max-height:600px;overflow-y:auto}.agent-activities.svelte-749azb.svelte-749azb{margin-top:20px;grid-template-columns:repeat(2, 1fr);gap:10px;display:flex;justify-content:space-around;align-items:center;max-width:100%;;}.agent-section.svelte-749azb.svelte-749azb{margin:20px 0;display:flex;flex-direction:column}.agent-card.svelte-749azb.svelte-749azb{border:1px solid var(--orchestra-borderColor);padding:20px;border-radius:5px;background-color:var(--orchestra-backgroundColor);display:flex;flex-direction:column;gap:10px}.agent-card.svelte-749azb img.svelte-749azb{max-width:300px;height:auto;border-radius:30px}.agent-hero.svelte-749azb.svelte-749azb{display:flex;flex-direction:column;justify-content:center;align-items:center}.agent-main.svelte-749azb.svelte-749azb{display:flex;flex-wrap:wrap;flex:1;justify-content:space-between;gap:20px}.agent-details.svelte-749azb.svelte-749azb{flex:1}.agent-details.svelte-749azb h2.svelte-749azb{margin-top:0}.agent-details.svelte-749azb h3.svelte-749azb{margin:0}.agent-activities.svelte-749azb img.svelte-749azb{max-height:300px;width:100%;object-fit:cover;border:1px solid var(--orchestra-borderColor);border-radius:25px}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VjdGlvbkFnZW50LnN2ZWx0ZSIsIm1hcHBpbmdzIjoiQUFTSSw2Q0FBa0IsQ0FDZCxPQUFPLENBQUUsSUFBSSxDQUNiLHFCQUFxQixDQUFFLE9BQU8sU0FBUyxDQUFDLENBQUMsT0FBTyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUM1RCxHQUFHLENBQUUsSUFBSSxDQUNULGVBQWUsQ0FBRSxVQUFVLENBQzNCLFdBQVcsQ0FBRSxNQUFNLENBQ25CLFVBQVUsQ0FBRSxLQUFLLENBQ2pCLFVBQVUsQ0FBRSxJQUNoQixDQUVBLDZDQUFrQixDQUNkLFVBQVUsQ0FBRSxJQUFJLENBQ2hCLHFCQUFxQixDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQ3JDLEdBQUcsQ0FBRSxJQUFJLENBQ1QsT0FBTyxDQUFFLElBQUksQ0FDYixlQUFlLENBQUUsWUFBWSxDQUM3QixXQUFXLENBQUUsTUFBTSxDQUNuQixTQUFTLENBQUUsSUFBSSxDQUFDLENBQ3BCLENBRUEsMENBQWUsQ0FDWCxNQUFNLENBQUUsSUFBSSxDQUFDLENBQUMsQ0FDZCxPQUFPLENBQUUsSUFBSSxDQUNiLGNBQWMsQ0FBRSxNQUNwQixDQUVBLHVDQUFZLENBQ1IsTUFBTSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSx1QkFBdUIsQ0FBQyxDQUM5QyxPQUFPLENBQUUsSUFBSSxDQUNiLGFBQWEsQ0FBRSxHQUFHLENBQ2xCLGdCQUFnQixDQUFFLElBQUksMkJBQTJCLENBQUMsQ0FDbEQsT0FBTyxDQUFFLElBQUksQ0FDYixjQUFjLENBQUUsTUFBTSxDQUN0QixHQUFHLENBQUUsSUFDVCxDQUVBLHlCQUFXLENBQUMsaUJBQUksQ0FDWixTQUFTLENBQUUsS0FBSyxDQUNoQixNQUFNLENBQUUsSUFBSSxDQUNaLGFBQWEsQ0FBRSxJQUNuQixDQUVBLHVDQUFZLENBQ1IsT0FBTyxDQUFFLElBQUksQ0FDYixjQUFjLENBQUUsTUFBTSxDQUN0QixlQUFlLENBQUUsTUFBTSxDQUN2QixXQUFXLENBQUUsTUFDakIsQ0FFQSx1Q0FBWSxDQUNSLE9BQU8sQ0FBRSxJQUFJLENBQ2IsU0FBUyxDQUFFLElBQUksQ0FDZixJQUFJLENBQUUsQ0FBQyxDQUNQLGVBQWUsQ0FBRSxhQUFhLENBQzlCLEdBQUcsQ0FBRSxJQUNULENBRUEsMENBQWUsQ0FDWCxJQUFJLENBQUUsQ0FDVixDQUVBLDRCQUFjLENBQUMsZ0JBQUcsQ0FDZCxVQUFVLENBQUUsQ0FDaEIsQ0FFQSw0QkFBYyxDQUFDLGdCQUFHLENBQ2QsTUFBTSxDQUFFLENBQ1osQ0FFQSwrQkFBaUIsQ0FBQyxpQkFBSSxDQUNsQixVQUFVLENBQUUsS0FBSyxDQUNqQixLQUFLLENBQUUsSUFBSSxDQUNYLFVBQVUsQ0FBRSxLQUFLLENBQ2pCLE1BQU0sQ0FBRSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksdUJBQXVCLENBQUMsQ0FDOUMsYUFBYSxDQUFFLElBQ25CIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbIlNlY3Rpb25BZ2VudC5zdmVsdGUiXX0= */");
	}

	// (97:16) {:else}
	function create_else_block_2(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for agent image");
				attr_dev(img, "class", "svelte-749azb");
				add_location(img, file$4, 97, 20, 2366);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block_2.name,
			type: "else",
			source: "(97:16) {:else}",
			ctx
		});

		return block;
	}

	// (95:37) 
	function create_if_block_5(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = agentImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for agent image");
				attr_dev(img, "class", "svelte-749azb");
				add_location(img, file$4, 95, 20, 2263);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_5.name,
			type: "if",
			source: "(95:37) ",
			ctx
		});

		return block;
	}

	// (93:16) {#if agentImage && agentImage?.ext_src}
	function create_if_block_4(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: agentImage },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_4.name,
			type: "if",
			source: "(93:16) {#if agentImage && agentImage?.ext_src}",
			ctx
		});

		return block;
	}

	// (125:12) {:else}
	function create_else_block_1(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for agent activity image");
				attr_dev(img, "class", "svelte-749azb");
				add_location(img, file$4, 125, 16, 4070);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block_1.name,
			type: "else",
			source: "(125:12) {:else}",
			ctx
		});

		return block;
	}

	// (123:42) 
	function create_if_block_3(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = agentActivityImage1)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for agent activity image");
				attr_dev(img, "class", "svelte-749azb");
				add_location(img, file$4, 123, 16, 3957);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_3.name,
			type: "if",
			source: "(123:42) ",
			ctx
		});

		return block;
	}

	// (121:12) {#if agentActivityImage1 && agentActivityImage1?.ext_src}
	function create_if_block_2(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: agentActivityImage1 },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_2.name,
			type: "if",
			source: "(121:12) {#if agentActivityImage1 && agentActivityImage1?.ext_src}",
			ctx
		});

		return block;
	}

	// (134:12) {:else}
	function create_else_block$1(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = placeholderImage)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for agent activity image");
				attr_dev(img, "class", "svelte-749azb");
				add_location(img, file$4, 134, 16, 4487);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block$1.name,
			type: "else",
			source: "(134:12) {:else}",
			ctx
		});

		return block;
	}

	// (132:42) 
	function create_if_block_1(ctx) {
		let img;
		let img_src_value;

		const block = {
			c: function create() {
				img = element("img");
				if (!src_url_equal(img.src, img_src_value = agentActivityImage2)) attr_dev(img, "src", img_src_value);
				attr_dev(img, "alt", "Placeholder for agent activity image");
				attr_dev(img, "class", "svelte-749azb");
				add_location(img, file$4, 132, 16, 4374);
			},
			m: function mount(target, anchor) {
				insert_dev(target, img, anchor);
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(img);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block_1.name,
			type: "if",
			source: "(132:42) ",
			ctx
		});

		return block;
	}

	// (130:12) {#if agentActivityImage2 && agentActivityImage2?.ext_src}
	function create_if_block$1(ctx) {
		let image;
		let current;

		image = new Image({
				props: { image: agentActivityImage2 },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(image.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(image, target, anchor);
				current = true;
			},
			i: function intro(local) {
				if (current) return;
				transition_in(image.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(image.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(image, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block$1.name,
			type: "if",
			source: "(130:12) {#if agentActivityImage2 && agentActivityImage2?.ext_src}",
			ctx
		});

		return block;
	}

	function create_fragment$4(ctx) {
		let section;
		let div4;
		let div3;
		let div0;
		let current_block_type_index;
		let if_block0;
		let t0;
		let div2;
		let h2;
		let t1;
		let t2;
		let p0;
		let t4;
		let div1;
		let h3;
		let t5;
		let t6;
		let p1;
		let t7;
		let t8;
		let t9;
		let p2;
		let t10;
		let t11;
		let t12;
		let t13;
		let p3;
		let t14;
		let t15;
		let t16;
		let t17;
		let div7;
		let div5;
		let current_block_type_index_1;
		let if_block1;
		let t18;
		let div6;
		let current_block_type_index_2;
		let if_block2;
		let current;
		const if_block_creators = [create_if_block_4, create_if_block_5, create_else_block_2];
		const if_blocks = [];

		function select_block_type(ctx, dirty) {
			if (agentImage && agentImage?.ext_src) return 0;
			if (agentImage) return 1;
			return 2;
		}

		current_block_type_index = select_block_type();
		if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
		const if_block_creators_1 = [create_if_block_2, create_if_block_3, create_else_block_1];
		const if_blocks_1 = [];

		function select_block_type_1(ctx, dirty) {
			if (agentActivityImage1 && agentActivityImage1?.ext_src) return 0;
			if (agentActivityImage1) return 1;
			return 2;
		}

		current_block_type_index_1 = select_block_type_1();
		if_block1 = if_blocks_1[current_block_type_index_1] = if_block_creators_1[current_block_type_index_1](ctx);
		const if_block_creators_2 = [create_if_block$1, create_if_block_1, create_else_block$1];
		const if_blocks_2 = [];

		function select_block_type_2(ctx, dirty) {
			if (agentActivityImage2 && agentActivityImage2?.ext_src) return 0;
			if (agentActivityImage2) return 1;
			return 2;
		}

		current_block_type_index_2 = select_block_type_2();
		if_block2 = if_blocks_2[current_block_type_index_2] = if_block_creators_2[current_block_type_index_2](ctx);

		const block = {
			c: function create() {
				section = element("section");
				div4 = element("div");
				div3 = element("div");
				div0 = element("div");
				if_block0.c();
				t0 = space();
				div2 = element("div");
				h2 = element("h2");
				t1 = text(/*agentName*/ ctx[0]);
				t2 = space();
				p0 = element("p");
				p0.textContent = "Agent description goes here. This section can include details about the agent's experience, specialties, and any other relevant information.";
				t4 = space();
				div1 = element("div");
				h3 = element("h3");
				t5 = text(/*brokerageName*/ ctx[1]);
				t6 = space();
				p1 = element("p");
				t7 = text(/*brokerageName*/ ctx[1]);
				t8 = text(" is a full-service real estate brokerage proudly serving the great state of Texas. With years of experience and a deep understanding of the Texas market, our dedicated team is committed to helping clients find their dream homes, investment properties, and commercial spaces.");
				t9 = space();
				p2 = element("p");
				t10 = text("From first-time buyers to seasoned investors, ");
				t11 = text(/*brokerageName*/ ctx[1]);
				t12 = text(" provides personalized guidance every step of the way. Our extensive knowledge of local communities and unparalleled commitment to customer satisfaction makes us a trusted partner in all things real estate.");
				t13 = space();
				p3 = element("p");
				t14 = text("Let ");
				t15 = text(/*brokerageName*/ ctx[1]);
				t16 = text(" make your next move seamless and stress-free.");
				t17 = space();
				div7 = element("div");
				div5 = element("div");
				if_block1.c();
				t18 = space();
				div6 = element("div");
				if_block2.c();
				attr_dev(div0, "class", "agent-hero svelte-749azb");
				add_location(div0, file$4, 91, 12, 2075);
				attr_dev(h2, "class", "svelte-749azb");
				add_location(h2, file$4, 101, 16, 2528);
				add_location(p0, file$4, 102, 16, 2565);
				attr_dev(h3, "class", "svelte-749azb");
				add_location(h3, file$4, 104, 20, 2787);
				add_location(p1, file$4, 105, 20, 2832);
				add_location(p2, file$4, 108, 20, 3196);
				add_location(p3, file$4, 111, 20, 3538);
				attr_dev(div1, "class", "agent-brokerage-details");
				add_location(div1, file$4, 103, 16, 2729);
				attr_dev(div2, "class", "agent-details svelte-749azb");
				add_location(div2, file$4, 100, 12, 2484);
				attr_dev(div3, "class", "agent-main svelte-749azb");
				add_location(div3, file$4, 90, 8, 2038);
				attr_dev(div4, "class", "agent-card svelte-749azb");
				add_location(div4, file$4, 89, 4, 2005);
				add_location(div5, file$4, 119, 8, 3768);
				add_location(div6, file$4, 128, 8, 4185);
				attr_dev(div7, "class", "agent-activities svelte-749azb");
				add_location(div7, file$4, 118, 4, 3729);
				attr_dev(section, "class", "section agent-section svelte-749azb");
				add_location(section, file$4, 88, 0, 1961);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, section, anchor);
				append_dev(section, div4);
				append_dev(div4, div3);
				append_dev(div3, div0);
				if_blocks[current_block_type_index].m(div0, null);
				append_dev(div3, t0);
				append_dev(div3, div2);
				append_dev(div2, h2);
				append_dev(h2, t1);
				append_dev(div2, t2);
				append_dev(div2, p0);
				append_dev(div2, t4);
				append_dev(div2, div1);
				append_dev(div1, h3);
				append_dev(h3, t5);
				append_dev(div1, t6);
				append_dev(div1, p1);
				append_dev(p1, t7);
				append_dev(p1, t8);
				append_dev(div1, t9);
				append_dev(div1, p2);
				append_dev(p2, t10);
				append_dev(p2, t11);
				append_dev(p2, t12);
				append_dev(div1, t13);
				append_dev(div1, p3);
				append_dev(p3, t14);
				append_dev(p3, t15);
				append_dev(p3, t16);
				append_dev(section, t17);
				append_dev(section, div7);
				append_dev(div7, div5);
				if_blocks_1[current_block_type_index_1].m(div5, null);
				append_dev(div7, t18);
				append_dev(div7, div6);
				if_blocks_2[current_block_type_index_2].m(div6, null);
				current = true;
			},
			p: function update(ctx, [dirty]) {
				if (!current || dirty & /*agentName*/ 1) set_data_dev(t1, /*agentName*/ ctx[0]);
				if (!current || dirty & /*brokerageName*/ 2) set_data_dev(t5, /*brokerageName*/ ctx[1]);
				if (!current || dirty & /*brokerageName*/ 2) set_data_dev(t7, /*brokerageName*/ ctx[1]);
				if (!current || dirty & /*brokerageName*/ 2) set_data_dev(t11, /*brokerageName*/ ctx[1]);
				if (!current || dirty & /*brokerageName*/ 2) set_data_dev(t15, /*brokerageName*/ ctx[1]);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(if_block0);
				transition_in(if_block1);
				transition_in(if_block2);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block0);
				transition_out(if_block1);
				transition_out(if_block2);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(section);
				}

				if_blocks[current_block_type_index].d();
				if_blocks_1[current_block_type_index_1].d();
				if_blocks_2[current_block_type_index_2].d();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$4.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$4($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('SectionAgent', slots, []);
		let { agentName = 'Agent Name' } = $$props;
		let { brokerageName = 'Brokerage Name' } = $$props;
		const writable_props = ['agentName', 'brokerageName'];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<SectionAgent> was created with unknown prop '${key}'`);
		});

		$$self.$$set = $$props => {
			if ('agentName' in $$props) $$invalidate(0, agentName = $$props.agentName);
			if ('brokerageName' in $$props) $$invalidate(1, brokerageName = $$props.brokerageName);
		};

		$$self.$capture_state = () => ({
			placeholderImage,
			agentImage,
			agentActivityImage1,
			agentActivityImage2,
			Image,
			agentName,
			brokerageName
		});

		$$self.$inject_state = $$props => {
			if ('agentName' in $$props) $$invalidate(0, agentName = $$props.agentName);
			if ('brokerageName' in $$props) $$invalidate(1, brokerageName = $$props.brokerageName);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [agentName, brokerageName];
	}

	class SectionAgent extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$4, create_fragment$4, safe_not_equal, { agentName: 0, brokerageName: 1 }, add_css$3);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "SectionAgent",
				options,
				id: create_fragment$4.name
			});
		}

		get agentName() {
			return this.$$.ctx[0];
		}

		set agentName(agentName) {
			this.$$set({ agentName });
			flush();
		}

		get brokerageName() {
			return this.$$.ctx[1];
		}

		set brokerageName(brokerageName) {
			this.$$set({ brokerageName });
			flush();
		}
	}

	create_custom_element(SectionAgent, {"agentName":{},"brokerageName":{}}, [], [], true);

	/* src/components/media/Video.svelte generated by Svelte v4.2.18 */
	const file$3 = "src/components/media/Video.svelte";

	function add_css$2(target) {
		append_styles(target, "svelte-1v4disg", "video.svelte-1v4disg{max-width:100%;max-height:500px;border-radius:8px;margin-bottom:10px;outline:1px solid darkgray}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlkZW8uc3ZlbHRlIiwibWFwcGluZ3MiOiJBQVdJLG9CQUFNLENBQ0YsU0FBUyxDQUFFLElBQUksQ0FDZixVQUFVLENBQUUsS0FBSyxDQUNqQixhQUFhLENBQUUsR0FBRyxDQUNsQixhQUFhLENBQUUsSUFBSSxDQUNuQixPQUFPLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUN2QiIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJWaWRlby5zdmVsdGUiXX0= */");
	}

	function create_fragment$3(ctx) {
		let video;
		let source;
		let source_src_value;
		let t;

		const block = {
			c: function create() {
				video = element("video");
				source = element("source");
				t = text("\n    Your browser does not support the video tag.");
				if (!src_url_equal(source.src, source_src_value = /*videoSrc*/ ctx[0])) attr_dev(source, "src", source_src_value);
				attr_dev(source, "type", "video/mp4");
				add_location(source, file$3, 6, 4, 112);
				video.controls = true;
				attr_dev(video, "class", "svelte-1v4disg");
				add_location(video, file$3, 5, 0, 91);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, video, anchor);
				append_dev(video, source);
				append_dev(video, t);
			},
			p: function update(ctx, [dirty]) {
				if (dirty & /*videoSrc*/ 1 && !src_url_equal(source.src, source_src_value = /*videoSrc*/ ctx[0])) {
					attr_dev(source, "src", source_src_value);
				}
			},
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(video);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$3.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$3($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('Video', slots, []);
		let { videoSrc } = $$props;

		$$self.$$.on_mount.push(function () {
			if (videoSrc === undefined && !('videoSrc' in $$props || $$self.$$.bound[$$self.$$.props['videoSrc']])) {
				console.warn("<Video> was created without expected prop 'videoSrc'");
			}
		});

		const writable_props = ['videoSrc'];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Video> was created with unknown prop '${key}'`);
		});

		$$self.$$set = $$props => {
			if ('videoSrc' in $$props) $$invalidate(0, videoSrc = $$props.videoSrc);
		};

		$$self.$capture_state = () => ({ videoSrc });

		$$self.$inject_state = $$props => {
			if ('videoSrc' in $$props) $$invalidate(0, videoSrc = $$props.videoSrc);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [videoSrc];
	}

	class Video extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$3, create_fragment$3, safe_not_equal, { videoSrc: 0 }, add_css$2);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "Video",
				options,
				id: create_fragment$3.name
			});
		}

		get videoSrc() {
			return this.$$.ctx[0];
		}

		set videoSrc(videoSrc) {
			this.$$set({ videoSrc });
			flush();
		}
	}

	create_custom_element(Video, {"videoSrc":{}}, [], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/Section/SectionBuyingFirstHome.svelte generated by Svelte v4.2.18 */
	const file$2 = "src/orchestraUi/DevTools/SiteDesignPreview/Section/SectionBuyingFirstHome.svelte";

	function add_css$1(target) {
		append_styles(target, "svelte-1mapwvv", ".video-container.svelte-1mapwvv.svelte-1mapwvv{width:100%;height:auto}.video-container.svelte-1mapwvv video.svelte-1mapwvv{width:100%}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VjdGlvbkJ1eWluZ0ZpcnN0SG9tZS5zdmVsdGUiLCJtYXBwaW5ncyI6IkFBTUksOENBQWlCLENBQ2IsS0FBSyxDQUFFLElBQUksQ0FDWCxNQUFNLENBQUUsSUFDWixDQUVBLCtCQUFnQixDQUFDLG9CQUFNLENBQ25CLEtBQUssQ0FBRSxJQUNYIiwibmFtZXMiOltdLCJzb3VyY2VzIjpbIlNlY3Rpb25CdXlpbmdGaXJzdEhvbWUuc3ZlbHRlIl19 */");
	}

	// (25:8) {:else}
	function create_else_block(ctx) {
		let video_1;
		let source;
		let source_src_value;
		let t;

		const block = {
			c: function create() {
				video_1 = element("video");
				source = element("source");
				t = text("\n                Your browser does not support the video tag.");
				if (!src_url_equal(source.src, source_src_value = placeholderVideo)) attr_dev(source, "src", source_src_value);
				attr_dev(source, "type", "video/mp4");
				add_location(source, file$2, 26, 16, 724);
				video_1.controls = true;
				attr_dev(video_1, "class", "svelte-1mapwvv");
				add_location(video_1, file$2, 25, 12, 691);
			},
			m: function mount(target, anchor) {
				insert_dev(target, video_1, anchor);
				append_dev(video_1, source);
				append_dev(video_1, t);
			},
			p: noop$3,
			i: noop$3,
			o: noop$3,
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(video_1);
				}
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_else_block.name,
			type: "else",
			source: "(25:8) {:else}",
			ctx
		});

		return block;
	}

	// (23:8) {#if $video}
	function create_if_block(ctx) {
		let video_1;
		let current;

		video_1 = new Video({
				props: { videoSrc: /*$video*/ ctx[0] },
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(video_1.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(video_1, target, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				const video_1_changes = {};
				if (dirty & /*$video*/ 1) video_1_changes.videoSrc = /*$video*/ ctx[0];
				video_1.$set(video_1_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(video_1.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(video_1.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(video_1, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_if_block.name,
			type: "if",
			source: "(23:8) {#if $video}",
			ctx
		});

		return block;
	}

	function create_fragment$2(ctx) {
		let section;
		let h2;
		let t1;
		let p;
		let t3;
		let div;
		let current_block_type_index;
		let if_block;
		let current;
		const if_block_creators = [create_if_block, create_else_block];
		const if_blocks = [];

		function select_block_type(ctx, dirty) {
			if (/*$video*/ ctx[0]) return 0;
			return 1;
		}

		current_block_type_index = select_block_type(ctx);
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

		const block = {
			c: function create() {
				section = element("section");
				h2 = element("h2");
				h2.textContent = "Buying Your First Home";
				t1 = space();
				p = element("p");
				p.textContent = "This video is designed to help first-time home buyers navigate the process of purchasing their first home.";
				t3 = space();
				div = element("div");
				if_block.c();
				add_location(h2, file$2, 19, 4, 418);
				add_location(p, file$2, 20, 4, 454);
				attr_dev(div, "class", "video-container svelte-1mapwvv");
				add_location(div, file$2, 21, 4, 572);
				attr_dev(section, "class", "section");
				add_location(section, file$2, 18, 0, 388);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				insert_dev(target, section, anchor);
				append_dev(section, h2);
				append_dev(section, t1);
				append_dev(section, p);
				append_dev(section, t3);
				append_dev(section, div);
				if_blocks[current_block_type_index].m(div, null);
				current = true;
			},
			p: function update(ctx, [dirty]) {
				let previous_block_index = current_block_type_index;
				current_block_type_index = select_block_type(ctx);

				if (current_block_type_index === previous_block_index) {
					if_blocks[current_block_type_index].p(ctx, dirty);
				} else {
					group_outros();

					transition_out(if_blocks[previous_block_index], 1, 1, () => {
						if_blocks[previous_block_index] = null;
					});

					check_outros();
					if_block = if_blocks[current_block_type_index];

					if (!if_block) {
						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
						if_block.c();
					} else {
						if_block.p(ctx, dirty);
					}

					transition_in(if_block, 1);
					if_block.m(div, null);
				}
			},
			i: function intro(local) {
				if (current) return;
				transition_in(if_block);
				current = true;
			},
			o: function outro(local) {
				transition_out(if_block);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(section);
				}

				if_blocks[current_block_type_index].d();
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$2.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$2($$self, $$props, $$invalidate) {
		let $video;
		validate_store(video, 'video');
		component_subscribe($$self, video, $$value => $$invalidate(0, $video = $$value));
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('SectionBuyingFirstHome', slots, []);
		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<SectionBuyingFirstHome> was created with unknown prop '${key}'`);
		});

		$$self.$capture_state = () => ({ placeholderVideo, video, Video, $video });
		return [$video];
	}

	class SectionBuyingFirstHome extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$2, create_fragment$2, safe_not_equal, {}, add_css$1);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "SectionBuyingFirstHome",
				options,
				id: create_fragment$2.name
			});
		}
	}

	create_custom_element(SectionBuyingFirstHome, {}, [], [], true);

	/* src/components/layout/Portal/Portal.svelte generated by Svelte v4.2.18 */

	const { console: console_1 } = globals;
	const file$1 = "src/components/layout/Portal/Portal.svelte";

	function create_fragment$1(ctx) {
		let t;
		let div;
		let current;
		const default_slot_template = /*#slots*/ ctx[5].default;
		const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[4], null);
		const default_slot_template_1 = /*#slots*/ ctx[5].default;
		const default_slot_1 = create_slot(default_slot_template_1, ctx, /*$$scope*/ ctx[4], null);

		const block = {
			c: function create() {
				if (default_slot) default_slot.c();
				t = space();
				div = element("div");
				if (default_slot_1) default_slot_1.c();
				add_location(div, file$1, 74, 0, 2967);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				if (default_slot) {
					default_slot.m(target, anchor);
				}

				insert_dev(target, t, anchor);
				insert_dev(target, div, anchor);

				if (default_slot_1) {
					default_slot_1.m(div, null);
				}

				/*div_binding*/ ctx[6](div);
				current = true;
			},
			p: function update(ctx, [dirty]) {
				if (default_slot) {
					if (default_slot.p && (!current || dirty & /*$$scope*/ 16)) {
						update_slot_base(
							default_slot,
							default_slot_template,
							ctx,
							/*$$scope*/ ctx[4],
							!current
							? get_all_dirty_from_scope(/*$$scope*/ ctx[4])
							: get_slot_changes(default_slot_template, /*$$scope*/ ctx[4], dirty, null),
							null
						);
					}
				}

				if (default_slot_1) {
					if (default_slot_1.p && (!current || dirty & /*$$scope*/ 16)) {
						update_slot_base(
							default_slot_1,
							default_slot_template_1,
							ctx,
							/*$$scope*/ ctx[4],
							!current
							? get_all_dirty_from_scope(/*$$scope*/ ctx[4])
							: get_slot_changes(default_slot_template_1, /*$$scope*/ ctx[4], dirty, null),
							null
						);
					}
				}
			},
			i: function intro(local) {
				if (current) return;
				transition_in(default_slot, local);
				transition_in(default_slot_1, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(default_slot, local);
				transition_out(default_slot_1, local);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(t);
					detach_dev(div);
				}

				if (default_slot) default_slot.d(detaching);
				if (default_slot_1) default_slot_1.d(detaching);
				/*div_binding*/ ctx[6](null);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment$1.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance$1($$self, $$props, $$invalidate) {
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('Portal', slots, ['default']);
		let { renderInBaseSite = false } = $$props;
		let { targetSelector = '' } = $$props;
		let { insertionMethod = 'append' } = $$props;
		let target;
		let slotWrapper; // Holds the wrapper element for the slot content

		// Function to inject the slot content into the target based on insertion method
		const injectContent = () => {
			if (target && slotWrapper) {
				switch (insertionMethod) {
					case 'prepend':
						target.insertAdjacentElement('afterbegin', slotWrapper);
						break;
					case 'before':
						target.insertAdjacentElement('beforebegin', slotWrapper);
						break;
					case 'after':
						target.insertAdjacentElement('afterend', slotWrapper);
						break;
					case 'replace':
						target.innerHTML = '';
						target.appendChild(
							slotWrapper
						);
						break;
					default:
						target.appendChild(
							slotWrapper
						);
						break;
				} // Default is append

				console.log(`Injected slot content into the base site using ${insertionMethod} method.`);
			}
		};

		onMount(() => {
			if (renderInBaseSite) {
				// Find the target element by selector in the base site
				if (targetSelector) {
					target = document.querySelector(targetSelector);
				}

				// If no valid target is found, create a new div in the body of the base site
				if (!target) {
					target = document.createElement('div');
					document.body.appendChild(target);
					console.log('Created a new target div in the body.');
				} else {
					console.log(`Found existing target: ${targetSelector}`);
				}

				// Inject the content using the selected insertion method
				injectContent();
			} else {
				console.log('Rendering within Orchestra UI only.');
			}
		});

		onDestroy(() => {
			// Clean up dynamically created target and component in the base site if necessary
			if (renderInBaseSite && target && slotWrapper) {
				target.removeChild(slotWrapper);
				console.log('Removed injected content from the base site.');
			}

			if (renderInBaseSite && target && !targetSelector) {
				document.body.removeChild(target);
				console.log('Removed dynamically created target div from body.');
			}
		});

		const writable_props = ['renderInBaseSite', 'targetSelector', 'insertionMethod'];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<Portal> was created with unknown prop '${key}'`);
		});

		function div_binding($$value) {
			binding_callbacks[$$value ? 'unshift' : 'push'](() => {
				slotWrapper = $$value;
				$$invalidate(0, slotWrapper);
			});
		}

		$$self.$$set = $$props => {
			if ('renderInBaseSite' in $$props) $$invalidate(1, renderInBaseSite = $$props.renderInBaseSite);
			if ('targetSelector' in $$props) $$invalidate(2, targetSelector = $$props.targetSelector);
			if ('insertionMethod' in $$props) $$invalidate(3, insertionMethod = $$props.insertionMethod);
			if ('$$scope' in $$props) $$invalidate(4, $$scope = $$props.$$scope);
		};

		$$self.$capture_state = () => ({
			onMount,
			onDestroy,
			renderInBaseSite,
			targetSelector,
			insertionMethod,
			target,
			slotWrapper,
			injectContent
		});

		$$self.$inject_state = $$props => {
			if ('renderInBaseSite' in $$props) $$invalidate(1, renderInBaseSite = $$props.renderInBaseSite);
			if ('targetSelector' in $$props) $$invalidate(2, targetSelector = $$props.targetSelector);
			if ('insertionMethod' in $$props) $$invalidate(3, insertionMethod = $$props.insertionMethod);
			if ('target' in $$props) target = $$props.target;
			if ('slotWrapper' in $$props) $$invalidate(0, slotWrapper = $$props.slotWrapper);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [
			slotWrapper,
			renderInBaseSite,
			targetSelector,
			insertionMethod,
			$$scope,
			slots,
			div_binding
		];
	}

	class Portal extends SvelteComponentDev {
		constructor(options) {
			super(options);

			init(this, options, instance$1, create_fragment$1, safe_not_equal, {
				renderInBaseSite: 1,
				targetSelector: 2,
				insertionMethod: 3
			});

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "Portal",
				options,
				id: create_fragment$1.name
			});
		}

		get renderInBaseSite() {
			return this.$$.ctx[1];
		}

		set renderInBaseSite(renderInBaseSite) {
			this.$$set({ renderInBaseSite });
			flush();
		}

		get targetSelector() {
			return this.$$.ctx[2];
		}

		set targetSelector(targetSelector) {
			this.$$set({ targetSelector });
			flush();
		}

		get insertionMethod() {
			return this.$$.ctx[3];
		}

		set insertionMethod(insertionMethod) {
			this.$$set({ insertionMethod });
			flush();
		}
	}

	create_custom_element(Portal, {"renderInBaseSite":{"type":"Boolean"},"targetSelector":{},"insertionMethod":{}}, ["default"], [], true);

	/* src/orchestraUi/DevTools/SiteDesignPreview/SiteDesignPreview.svelte generated by Svelte v4.2.18 */
	const file = "src/orchestraUi/DevTools/SiteDesignPreview/SiteDesignPreview.svelte";

	function add_css(target) {
		append_styles(target, "svelte-1qd635e", ".page-builder-container.svelte-1qd635e{height:100%;max-height:100%;display:flex;flex-direction:column}.ux-preview-controls.svelte-1qd635e,.screen-size-controls.svelte-1qd635e{width:100%;display:flex;justify-content:space-between;align-items:center;margin:10px;padding:10px;gap:20px}.screen-size-controls.svelte-1qd635e{justify-content:flex-end}.orchestra-preview-container.svelte-1qd635e{width:100%;display:flex;flex-direction:column;align-items:center;background-color:var(--orchestra-containerBackground-1);padding:10px}.orchestra-preview.svelte-1qd635e{position:relative;width:100%;transition:width 0.3s}.orchestra-preview.tablet.svelte-1qd635e{width:768px}.orchestra-preview.phone.svelte-1qd635e{width:375px}.section.svelte-1qd635e{padding:10px}.featured-areas.svelte-1qd635e,.listings-grid.svelte-1qd635e,.advertisement-images.svelte-1qd635e,.agent-activities.svelte-1qd635e{display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:10px;justify-content:center;align-items:center;max-height:600px;overflow-y:auto}.featured-areas.svelte-1qd635e{grid-template-columns:repeat(3, 1fr)}.agent-activities.svelte-1qd635e{margin-top:20px;grid-template-columns:repeat(2, 1fr);gap:10px;display:flex;align-items:center}.featured-area.svelte-1qd635e,.listing.svelte-1qd635e{position:relative;text-align:center}.listings-section.svelte-1qd635e{display:flex;flex-direction:column}.listings.svelte-1qd635e{position:relative;overflow:hidden;display:flex;justify-content:space-between;align-items:center}.listings-grid.svelte-1qd635e{flex:2;transition:transform 0.3s ease-in-out;padding:10px;border:1px solid var(--orchestra-cardBorder-4);border-radius:8px}.listing-detail.svelte-1qd635e{flex:1;margin-left:20px;border:1px solid var(--orchestra-borderColor);padding:20px;border-radius:5px;background-color:var(--orchestra-backgroundColor);max-width:300px;height:100%;overflow-y:auto}.listing-detail-selected.svelte-1qd635e{position:absolute;top:0;right:-100%;width:100%;height:100%;overflow-y:auto;transition:transform 0.3s ease-in-out;z-index:2;background-color:var(--orchestra-backgroundColor);border-left:1px solid var(--orchestra-borderColor);border-radius:5px}.listing-detail-selected-content.svelte-1qd635e{padding:20px}.listing-detail-selected.show.svelte-1qd635e{transform:translateX(-100%)}.button-back.svelte-1qd635e{display:block;margin-top:20px}.agent-section.svelte-1qd635e{margin:20px 0;display:flex;flex-direction:column}.agent-card.svelte-1qd635e{border:1px solid var(--orchestra-borderColor);padding:20px;border-radius:5px;background-color:var(--orchestra-backgroundColor);display:flex;flex-direction:column;gap:10px}.agent-hero.svelte-1qd635e{display:flex;flex-direction:column}.agent-header.svelte-1qd635e{display:flex;flex:1;align-items:space-between;gap:20px}.agent-details.svelte-1qd635e{flex:1}.video-container.svelte-1qd635e{width:100%;height:auto}.advertisement-images.svelte-1qd635e{display:grid;grid-template-columns:repeat(2, 1fr);gap:10px}.featured-property.svelte-1qd635e{display:flex;gap:20px;margin-bottom:20px}.featured-property-details.svelte-1qd635e{flex:2}.footer-content.svelte-1qd635e{display:flex;align-items:center;padding:20px;background-color:var(--orchestra-cardBackground-4);border-radius:8px}.brokerage-section.svelte-1qd635e,.contact-us-section.svelte-1qd635e{border-radius:4px;margin:20px}.brokerage-section.svelte-1qd635e{width:60%}.contact-us-section.svelte-1qd635e{width:40%}.contact-us-action.svelte-1qd635e{display:flex;justify-content:flex-end}.brokerage-info.svelte-1qd635e{display:flex;align-items:center;gap:20px}.brokerage-details.svelte-1qd635e{text-align:left}.button.svelte-1qd635e{padding:10px 20px;border-radius:4px;border:1px solid var(--orchestra-borderColor);background-color:var(--orchestra-primary-3);color:var(--orchestra-textColor);cursor:pointer}.popup-overlay.svelte-1qd635e{position:fixed;top:0;left:0;right:0;bottom:0;background-color:rgba(0, 0, 0, 0.5);display:flex;justify-content:center;align-items:center}.popup.svelte-1qd635e{background-color:var(--orchestra-cardBackground-3);border:4px solid var(--orchestra-card-border-3);color:var(--orchestra-textColor);padding:20px;border-radius:5px;text-align:center;height:600px;width:400px}.is-selected.svelte-1qd635e{background-color:var(--orchestra-accent1-4)}.left-controls.svelte-1qd635e{display:flex;gap:20px}.marketplace-button.svelte-1qd635e{color:var(--orchestra-success-4)}.marketplace-button.active.svelte-1qd635e{background-color:var(--orchestra-success-5);color:var(--orchestra-success-2)}.injection-button.svelte-1qd635e{color:var(--orchestra-danger-4)}.injection-button.active.svelte-1qd635e{background-color:var(--orchestra-danger-5);color:var(--orchestra-danger-2)}.stylish-boxes-button.svelte-1qd635e{color:var(--orchestra-info-4)}.stylish-boxes-button.active.svelte-1qd635e{background-color:var(--orchestra-info-5);color:var(--orchestra-info-2)}\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2l0ZURlc2lnblByZXZpZXcuc3ZlbHRlIiwibWFwcGluZ3MiOiJBQXFCSSxzQ0FBd0IsQ0FDcEIsTUFBTSxDQUFFLElBQUksQ0FDWixVQUFVLENBQUUsSUFBSSxDQUNoQixPQUFPLENBQUUsSUFBSSxDQUNiLGNBQWMsQ0FBRSxNQUNwQixDQUVBLG1DQUFvQixDQUFFLG9DQUFzQixDQUN4QyxLQUFLLENBQUUsSUFBSSxDQUNYLE9BQU8sQ0FBRSxJQUFJLENBQ2IsZUFBZSxDQUFFLGFBQWEsQ0FDOUIsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsTUFBTSxDQUFFLElBQUksQ0FDWixPQUFPLENBQUUsSUFBSSxDQUNiLEdBQUcsQ0FBRSxJQUNULENBRUEsb0NBQXNCLENBQ2xCLGVBQWUsQ0FBRSxRQUVyQixDQUVBLDJDQUE2QixDQUN6QixLQUFLLENBQUUsSUFBSSxDQUNYLE9BQU8sQ0FBRSxJQUFJLENBQ2IsY0FBYyxDQUFFLE1BQU0sQ0FDdEIsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsZ0JBQWdCLENBQUUsSUFBSSxpQ0FBaUMsQ0FBQyxDQUN4RCxPQUFPLENBQUUsSUFDYixDQUVBLGlDQUFtQixDQUNmLFFBQVEsQ0FBRSxRQUFRLENBQ2xCLEtBQUssQ0FBRSxJQUFJLENBQ1gsVUFBVSxDQUFFLEtBQUssQ0FBQyxJQUN0QixDQUVBLGtCQUFrQixzQkFBUSxDQUN0QixLQUFLLENBQUUsS0FDWCxDQUVBLGtCQUFrQixxQkFBTyxDQUNyQixLQUFLLENBQUUsS0FDWCxDQUVBLHVCQUFTLENBQ0wsT0FBTyxDQUFFLElBQ2IsQ0FHQSw4QkFBZSxDQUFFLDZCQUFjLENBQUUsb0NBQXFCLENBQUUsZ0NBQWtCLENBQ3RFLE9BQU8sQ0FBRSxJQUFJLENBQ2IscUJBQXFCLENBQUUsT0FBTyxTQUFTLENBQUMsQ0FBQyxPQUFPLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQzVELEdBQUcsQ0FBRSxJQUFJLENBQ1QsZUFBZSxDQUFFLE1BQU0sQ0FDdkIsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsVUFBVSxDQUFFLEtBQUssQ0FDakIsVUFBVSxDQUFFLElBQ2hCLENBRUEsOEJBQWdCLENBQ1oscUJBQXFCLENBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQ3hDLENBRUEsZ0NBQWtCLENBQ2QsVUFBVSxDQUFFLElBQUksQ0FDaEIscUJBQXFCLENBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FDckMsR0FBRyxDQUFFLElBQUksQ0FDVCxPQUFPLENBQUUsSUFBSSxDQUNiLFdBQVcsQ0FBRSxNQUNqQixDQUVBLDZCQUFjLENBQUUsdUJBQVMsQ0FDckIsUUFBUSxDQUFFLFFBQVEsQ0FDbEIsVUFBVSxDQUFFLE1BQ2hCLENBR0EsZ0NBQWtCLENBQ2QsT0FBTyxDQUFFLElBQUksQ0FDYixjQUFjLENBQUUsTUFDcEIsQ0FFQSx3QkFBVSxDQUNOLFFBQVEsQ0FBRSxRQUFRLENBQ2xCLFFBQVEsQ0FBRSxNQUFNLENBQ2hCLE9BQU8sQ0FBRSxJQUFJLENBQ2IsZUFBZSxDQUFFLGFBQWEsQ0FDOUIsV0FBVyxDQUFFLE1BQ2pCLENBRUEsNkJBQWUsQ0FDWCxJQUFJLENBQUUsQ0FBQyxDQUNQLFVBQVUsQ0FBRSxTQUFTLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FDdEMsT0FBTyxDQUFFLElBQUksQ0FDYixNQUFNLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLHdCQUF3QixDQUFDLENBQy9DLGFBQWEsQ0FBRSxHQUNuQixDQUVBLDhCQUFnQixDQUNaLElBQUksQ0FBRSxDQUFDLENBQ1AsV0FBVyxDQUFFLElBQUksQ0FDakIsTUFBTSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSx1QkFBdUIsQ0FBQyxDQUM5QyxPQUFPLENBQUUsSUFBSSxDQUNiLGFBQWEsQ0FBRSxHQUFHLENBQ2xCLGdCQUFnQixDQUFFLElBQUksMkJBQTJCLENBQUMsQ0FDbEQsU0FBUyxDQUFFLEtBQUssQ0FDaEIsTUFBTSxDQUFFLElBQUksQ0FDWixVQUFVLENBQUUsSUFDaEIsQ0FFQSx1Q0FBeUIsQ0FDckIsUUFBUSxDQUFFLFFBQVEsQ0FDbEIsR0FBRyxDQUFFLENBQUMsQ0FDTixLQUFLLENBQUUsS0FBSyxDQUNaLEtBQUssQ0FBRSxJQUFJLENBQ1gsTUFBTSxDQUFFLElBQUksQ0FDWixVQUFVLENBQUUsSUFBSSxDQUNoQixVQUFVLENBQUUsU0FBUyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQ3RDLE9BQU8sQ0FBRSxDQUFDLENBQ1YsZ0JBQWdCLENBQUUsSUFBSSwyQkFBMkIsQ0FBQyxDQUNsRCxXQUFXLENBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLHVCQUF1QixDQUFDLENBQ25ELGFBQWEsQ0FBRSxHQUNuQixDQUVBLCtDQUFpQyxDQUU3QixPQUFPLENBQUUsSUFDYixDQUVBLHdCQUF3QixvQkFBTSxDQUMxQixTQUFTLENBQUUsV0FBVyxLQUFLLENBQy9CLENBRUEsMkJBQWEsQ0FDVCxPQUFPLENBQUUsS0FBSyxDQUNkLFVBQVUsQ0FBRSxJQUNoQixDQUdBLDZCQUFlLENBQ1gsTUFBTSxDQUFFLElBQUksQ0FBQyxDQUFDLENBQ2QsT0FBTyxDQUFFLElBQUksQ0FDYixjQUFjLENBQUUsTUFDcEIsQ0FFQSwwQkFBWSxDQUNSLE1BQU0sQ0FBRSxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksdUJBQXVCLENBQUMsQ0FDOUMsT0FBTyxDQUFFLElBQUksQ0FDYixhQUFhLENBQUUsR0FBRyxDQUNsQixnQkFBZ0IsQ0FBRSxJQUFJLDJCQUEyQixDQUFDLENBQ2xELE9BQU8sQ0FBRSxJQUFJLENBQ2IsY0FBYyxDQUFFLE1BQU0sQ0FDdEIsR0FBRyxDQUFFLElBQ1QsQ0FFQSwwQkFBWSxDQUNSLE9BQU8sQ0FBRSxJQUFJLENBQ2IsY0FBYyxDQUFFLE1BQ3BCLENBRUEsNEJBQWMsQ0FDVixPQUFPLENBQUUsSUFBSSxDQUNiLElBQUksQ0FBRSxDQUFDLENBQ1AsV0FBVyxDQUFFLGFBQWEsQ0FDMUIsR0FBRyxDQUFFLElBQ1QsQ0FFQSw2QkFBZSxDQUNYLElBQUksQ0FBRSxDQUNWLENBT0EsK0JBQWlCLENBQ2IsS0FBSyxDQUFFLElBQUksQ0FDWCxNQUFNLENBQUUsSUFDWixDQUdBLG9DQUFzQixDQUNsQixPQUFPLENBQUUsSUFBSSxDQUNiLHFCQUFxQixDQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQ3JDLEdBQUcsQ0FBRSxJQUNULENBR0EsaUNBQW1CLENBQ2YsT0FBTyxDQUFFLElBQUksQ0FDYixHQUFHLENBQUUsSUFBSSxDQUNULGFBQWEsQ0FBRSxJQUNuQixDQUVBLHlDQUEyQixDQUN2QixJQUFJLENBQUUsQ0FDVixDQUVBLDhCQUFnQixDQUNaLE9BQU8sQ0FBRSxJQUFJLENBQ2IsV0FBVyxDQUFFLE1BQU0sQ0FDbkIsT0FBTyxDQUFFLElBQUksQ0FDYixnQkFBZ0IsQ0FBRSxJQUFJLDRCQUE0QixDQUFDLENBQ25ELGFBQWEsQ0FBRSxHQUNuQixDQUVBLGlDQUFrQixDQUFFLGtDQUFvQixDQUNwQyxhQUFhLENBQUUsR0FBRyxDQUNsQixNQUFNLENBQUUsSUFDWixDQUVBLGlDQUFtQixDQUNmLEtBQUssQ0FBRSxHQUNYLENBRUEsa0NBQW9CLENBQ2hCLEtBQUssQ0FBRSxHQUNYLENBRUEsaUNBQW1CLENBQ2YsT0FBTyxDQUFFLElBQUksQ0FDYixlQUFlLENBQUUsUUFDckIsQ0FFQSw4QkFBZ0IsQ0FDWixPQUFPLENBQUUsSUFBSSxDQUNiLFdBQVcsQ0FBRSxNQUFNLENBQ25CLEdBQUcsQ0FBRSxJQUNULENBRUEsaUNBQW1CLENBQ2YsVUFBVSxDQUFFLElBQ2hCLENBRUEsc0JBQVEsQ0FDSixPQUFPLENBQUUsSUFBSSxDQUFDLElBQUksQ0FDbEIsYUFBYSxDQUFFLEdBQUcsQ0FDbEIsTUFBTSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSx1QkFBdUIsQ0FBQyxDQUM5QyxnQkFBZ0IsQ0FBRSxJQUFJLHFCQUFxQixDQUFDLENBQzVDLEtBQUssQ0FBRSxJQUFJLHFCQUFxQixDQUFDLENBQ2pDLE1BQU0sQ0FBRSxPQUNaLENBR0EsNkJBQWUsQ0FDWCxRQUFRLENBQUUsS0FBSyxDQUNmLEdBQUcsQ0FBRSxDQUFDLENBQ04sSUFBSSxDQUFFLENBQUMsQ0FDUCxLQUFLLENBQUUsQ0FBQyxDQUNSLE1BQU0sQ0FBRSxDQUFDLENBQ1QsZ0JBQWdCLENBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FDcEMsT0FBTyxDQUFFLElBQUksQ0FDYixlQUFlLENBQUUsTUFBTSxDQUN2QixXQUFXLENBQUUsTUFDakIsQ0FFQSxxQkFBTyxDQUNILGdCQUFnQixDQUFFLElBQUksNEJBQTRCLENBQUMsQ0FDbkQsTUFBTSxDQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSx5QkFBeUIsQ0FBQyxDQUNoRCxLQUFLLENBQUUsSUFBSSxxQkFBcUIsQ0FBQyxDQUNqQyxPQUFPLENBQUUsSUFBSSxDQUNiLGFBQWEsQ0FBRSxHQUFHLENBQ2xCLFVBQVUsQ0FBRSxNQUFNLENBQ2xCLE1BQU0sQ0FBRSxLQUFLLENBQ2IsS0FBSyxDQUFFLEtBQ1gsQ0FFQSwyQkFBYSxDQUNULGdCQUFnQixDQUFFLElBQUkscUJBQXFCLENBQy9DLENBRUEsNkJBQWUsQ0FDWCxPQUFPLENBQUUsSUFBSSxDQUNiLEdBQUcsQ0FBRSxJQUNULENBRUEsa0NBQW9CLENBQ2hCLEtBQUssQ0FBRSxJQUFJLHFCQUFxQixDQUNwQyxDQUVBLG1CQUFtQixzQkFBUSxDQUN2QixnQkFBZ0IsQ0FBRSxJQUFJLHFCQUFxQixDQUFDLENBQzVDLEtBQUssQ0FBRSxJQUFJLHFCQUFxQixDQUNwQyxDQUVBLGdDQUFrQixDQUNkLEtBQUssQ0FBRSxJQUFJLG9CQUFvQixDQUNuQyxDQUVBLGlCQUFpQixzQkFBUSxDQUNyQixnQkFBZ0IsQ0FBRSxJQUFJLG9CQUFvQixDQUFDLENBQzNDLEtBQUssQ0FBRSxJQUFJLG9CQUFvQixDQUNuQyxDQUVBLG9DQUFzQixDQUNsQixLQUFLLENBQUUsSUFBSSxrQkFBa0IsQ0FDakMsQ0FFQSxxQkFBcUIsc0JBQVEsQ0FDekIsZ0JBQWdCLENBQUUsSUFBSSxrQkFBa0IsQ0FBQyxDQUN6QyxLQUFLLENBQUUsSUFBSSxrQkFBa0IsQ0FDakMiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiU2l0ZURlc2lnblByZXZpZXcuc3ZlbHRlIl19 */");
	}

	// (335:4) <Portal {renderInBaseSite} targetSelector="[data-orch-id='buying-guide-3']" insertionMethod="prepend">
	function create_default_slot_1(ctx) {
		let previewheader;
		let t0;
		let div3;
		let navbar;
		let t1;
		let div2;
		let sectionhero;
		let t2;
		let div1;
		let div0;
		let sectionfeaturedareas;
		let t3;
		let sectionlistings;
		let t4;
		let sectionagent;
		let t5;
		let sectionbuyingfirsthome;
		let t6;
		let aside;
		let t7;
		let article;
		let t8;
		let footer;
		let div3_class_value;
		let current;
		previewheader = new PreviewHeader({ $$inline: true });
		navbar = new NavBar({ $$inline: true });
		sectionhero = new SectionHero({ $$inline: true });
		sectionfeaturedareas = new SectionFeaturedAreas({ $$inline: true });
		sectionlistings = new SectionListings({ $$inline: true });
		sectionagent = new SectionAgent({ $$inline: true });
		sectionbuyingfirsthome = new SectionBuyingFirstHome({ $$inline: true });
		aside = new Aside({ $$inline: true });
		article = new Article({ $$inline: true });
		footer = new Footer({ $$inline: true });

		const block = {
			c: function create() {
				create_component(previewheader.$$.fragment);
				t0 = space();
				div3 = element("div");
				create_component(navbar.$$.fragment);
				t1 = space();
				div2 = element("div");
				create_component(sectionhero.$$.fragment);
				t2 = space();
				div1 = element("div");
				div0 = element("div");
				create_component(sectionfeaturedareas.$$.fragment);
				t3 = space();
				create_component(sectionlistings.$$.fragment);
				t4 = space();
				create_component(sectionagent.$$.fragment);
				t5 = space();
				create_component(sectionbuyingfirsthome.$$.fragment);
				t6 = space();
				create_component(aside.$$.fragment);
				t7 = space();
				create_component(article.$$.fragment);
				t8 = space();
				create_component(footer.$$.fragment);
				attr_dev(div0, "class", "main-content");
				add_location(div0, file, 341, 20, 8065);
				attr_dev(div1, "class", "container");
				add_location(div1, file, 340, 16, 8021);
				attr_dev(div2, "class", "orchestra-preview-main");
				add_location(div2, file, 338, 12, 7936);
				attr_dev(div3, "class", div3_class_value = "" + (null_to_empty(`orchestra-preview ${/*$selectedDevice*/ ctx[0]}`) + " svelte-1qd635e"));
				add_location(div3, file, 336, 8, 7848);
			},
			m: function mount(target, anchor) {
				mount_component(previewheader, target, anchor);
				insert_dev(target, t0, anchor);
				insert_dev(target, div3, anchor);
				mount_component(navbar, div3, null);
				append_dev(div3, t1);
				append_dev(div3, div2);
				mount_component(sectionhero, div2, null);
				append_dev(div2, t2);
				append_dev(div2, div1);
				append_dev(div1, div0);
				mount_component(sectionfeaturedareas, div0, null);
				append_dev(div0, t3);
				mount_component(sectionlistings, div0, null);
				append_dev(div0, t4);
				mount_component(sectionagent, div0, null);
				append_dev(div0, t5);
				mount_component(sectionbuyingfirsthome, div0, null);
				append_dev(div1, t6);
				mount_component(aside, div1, null);
				append_dev(div2, t7);
				mount_component(article, div2, null);
				append_dev(div3, t8);
				mount_component(footer, div3, null);
				current = true;
			},
			p: function update(ctx, dirty) {
				if (!current || dirty & /*$selectedDevice*/ 1 && div3_class_value !== (div3_class_value = "" + (null_to_empty(`orchestra-preview ${/*$selectedDevice*/ ctx[0]}`) + " svelte-1qd635e"))) {
					attr_dev(div3, "class", div3_class_value);
				}
			},
			i: function intro(local) {
				if (current) return;
				transition_in(previewheader.$$.fragment, local);
				transition_in(navbar.$$.fragment, local);
				transition_in(sectionhero.$$.fragment, local);
				transition_in(sectionfeaturedareas.$$.fragment, local);
				transition_in(sectionlistings.$$.fragment, local);
				transition_in(sectionagent.$$.fragment, local);
				transition_in(sectionbuyingfirsthome.$$.fragment, local);
				transition_in(aside.$$.fragment, local);
				transition_in(article.$$.fragment, local);
				transition_in(footer.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(previewheader.$$.fragment, local);
				transition_out(navbar.$$.fragment, local);
				transition_out(sectionhero.$$.fragment, local);
				transition_out(sectionfeaturedareas.$$.fragment, local);
				transition_out(sectionlistings.$$.fragment, local);
				transition_out(sectionagent.$$.fragment, local);
				transition_out(sectionbuyingfirsthome.$$.fragment, local);
				transition_out(aside.$$.fragment, local);
				transition_out(article.$$.fragment, local);
				transition_out(footer.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				if (detaching) {
					detach_dev(t0);
					detach_dev(div3);
				}

				destroy_component(previewheader, detaching);
				destroy_component(navbar);
				destroy_component(sectionhero);
				destroy_component(sectionfeaturedareas);
				destroy_component(sectionlistings);
				destroy_component(sectionagent);
				destroy_component(sectionbuyingfirsthome);
				destroy_component(aside);
				destroy_component(article);
				destroy_component(footer);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_default_slot_1.name,
			type: "slot",
			source: "(335:4) <Portal {renderInBaseSite} targetSelector=\\\"[data-orch-id='buying-guide-3']\\\" insertionMethod=\\\"prepend\\\">",
			ctx
		});

		return block;
	}

	// (334:0) <CollapsibleContainer title={"UX Preview"} initCollapsed={false}>
	function create_default_slot(ctx) {
		let portal;
		let current;

		portal = new Portal({
				props: {
					renderInBaseSite: /*renderInBaseSite*/ ctx[1],
					targetSelector: "[data-orch-id='buying-guide-3']",
					insertionMethod: "prepend",
					$$slots: { default: [create_default_slot_1] },
					$$scope: { ctx }
				},
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(portal.$$.fragment);
			},
			m: function mount(target, anchor) {
				mount_component(portal, target, anchor);
				current = true;
			},
			p: function update(ctx, dirty) {
				const portal_changes = {};

				if (dirty & /*$$scope, $selectedDevice*/ 5) {
					portal_changes.$$scope = { dirty, ctx };
				}

				portal.$set(portal_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(portal.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(portal.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(portal, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_default_slot.name,
			type: "slot",
			source: "(334:0) <CollapsibleContainer title={\\\"UX Preview\\\"} initCollapsed={false}>",
			ctx
		});

		return block;
	}

	function create_fragment(ctx) {
		let collapsiblecontainer;
		let current;

		collapsiblecontainer = new CollapsibleContainer({
				props: {
					title: "UX Preview",
					initCollapsed: false,
					$$slots: { default: [create_default_slot] },
					$$scope: { ctx }
				},
				$$inline: true
			});

		const block = {
			c: function create() {
				create_component(collapsiblecontainer.$$.fragment);
			},
			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},
			m: function mount(target, anchor) {
				mount_component(collapsiblecontainer, target, anchor);
				current = true;
			},
			p: function update(ctx, [dirty]) {
				const collapsiblecontainer_changes = {};

				if (dirty & /*$$scope, $selectedDevice*/ 5) {
					collapsiblecontainer_changes.$$scope = { dirty, ctx };
				}

				collapsiblecontainer.$set(collapsiblecontainer_changes);
			},
			i: function intro(local) {
				if (current) return;
				transition_in(collapsiblecontainer.$$.fragment, local);
				current = true;
			},
			o: function outro(local) {
				transition_out(collapsiblecontainer.$$.fragment, local);
				current = false;
			},
			d: function destroy(detaching) {
				destroy_component(collapsiblecontainer, detaching);
			}
		};

		dispatch_dev("SvelteRegisterBlock", {
			block,
			id: create_fragment.name,
			type: "component",
			source: "",
			ctx
		});

		return block;
	}

	function instance($$self, $$props, $$invalidate) {
		let $selectedDevice;
		validate_store(selectedDevice, 'selectedDevice');
		component_subscribe($$self, selectedDevice, $$value => $$invalidate(0, $selectedDevice = $$value));
		let { $$slots: slots = {}, $$scope } = $$props;
		validate_slots('SiteDesignPreview', slots, []);
		let renderInBaseSite = true;
		const writable_props = [];

		Object.keys($$props).forEach(key => {
			if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<SiteDesignPreview> was created with unknown prop '${key}'`);
		});

		$$self.$capture_state = () => ({
			selectedDevice,
			CollapsibleContainer,
			PreviewHeader,
			NavBar,
			Aside,
			Article,
			Footer,
			SectionHero,
			SectionFeaturedAreas,
			SectionListings,
			SectionAgent,
			SectionBuyingFirstHome,
			Portal,
			renderInBaseSite,
			$selectedDevice
		});

		$$self.$inject_state = $$props => {
			if ('renderInBaseSite' in $$props) $$invalidate(1, renderInBaseSite = $$props.renderInBaseSite);
		};

		if ($$props && "$$inject" in $$props) {
			$$self.$inject_state($$props.$$inject);
		}

		return [$selectedDevice, renderInBaseSite];
	}

	class SiteDesignPreview extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance, create_fragment, safe_not_equal, {}, add_css);

			dispatch_dev("SvelteRegisterComponent", {
				component: this,
				tagName: "SiteDesignPreview",
				options,
				id: create_fragment.name
			});
		}
	}

	create_custom_element(SiteDesignPreview, {}, [], [], true);

	return SiteDesignPreview;

})();
//# sourceMappingURL=site_design_preview.js.map
