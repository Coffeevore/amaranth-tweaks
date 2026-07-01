(() => {
	'use strict';

	/**
	 * Popups to enlarge, matched by their <h1> title text.
	 * Add another exact title here to cover more popups.
	 */
	const TARGET_TITLES = ['카드사용내역상세'];

	/** Never let a popup grow past this fraction of the window height. */
	const MAX_VIEWPORT_RATIO = 0.9;

	/** Ignore sub-pixel overflow noise (px). */
	const OVERFLOW_THRESHOLD = 2;

	const DIALOG_SELECTOR = '[data-orbit-component="OBTDialog"]';

	/** Boxes we have already attached a height guard to. */
	const guarded = new WeakSet<HTMLElement>();

	function isTargetDialog(node: Node | null): node is HTMLElement {
		if (!node || node.nodeType !== Node.ELEMENT_NODE) {
			return false;
		}

		const element = node as Element;

		if (!element.matches(DIALOG_SELECTOR)) {
			return false;
		}

		const heading = element.querySelector('h1');

		return heading !== null && TARGET_TITLES.includes(heading.textContent?.trim() ?? '');
	}

	/** The sized element is the parent of `.dialog_content`; its inline width/height/margins are what pin the popup to a fixed size. */
	function findBox(dialog: HTMLElement): HTMLElement | null {
		const content = dialog.querySelector('.dialog_content');

		if (!content) {
			return null;
		}

		return content.parentElement;
	}

	/** The receipt lives inside a custom scrollbar whose inner element is the thing that actually clips and scrolls. */
	function findScroller(dialog: HTMLElement): Element | null {
		const byStyle = dialog.querySelector('[class*="OBTScrollbar_root"] > div[style*="overflow: scroll"]');

		if (byStyle) {
			return byStyle;
		}

		const firstChild = dialog.querySelector('[class*="OBTScrollbar_root"] > div');

		if (firstChild) {
			return firstChild;
		}

		for (const element of dialog.querySelectorAll('*')) {
			if (element.scrollHeight - element.clientHeight > OVERFLOW_THRESHOLD) {
				return element;
			}
		}

		return null;
	}

	function applyHeight(box: HTMLElement, dialog: HTMLElement, height: number): void {
		box.style.setProperty('height', height + 'px', 'important');
		box.style.setProperty('margin-top', -Math.round(height / 2) + 'px');

		const data = dialog.querySelector<HTMLElement>('.dialog_data');

		if (data) {
			data.style.setProperty('height', height + 'px', 'important');
		}
	}

	/**
	 * The framework may re-pin the popup to its original height on later re-renders.
	 * Re-apply our height (and re-center) whenever that happens, but leave position alone otherwise so drag-to-move keeps working.
	 */
	function guardHeight(box: HTMLElement, dialog: HTMLElement): void {
		if (guarded.has(box)) {
			return;
		}

		guarded.add(box);

		const observer = new MutationObserver(() => {
			if (!box.isConnected) {
				observer.disconnect();

				return;
			}

			const wanted = box.dataset.amaranthHeight;

			if (wanted && box.style.height !== wanted + 'px') {
				applyHeight(box, dialog, Number(wanted));
			}
		});

		observer.observe(box, { attributes: true, attributeFilter: ['style'] });
	}

	/** Returns true once the popup has been resized (or needs no resizing). */
	function fitDialog(dialog: HTMLElement): boolean {
		const box = findBox(dialog);
		const scroller = findScroller(dialog);

		if (!box || !scroller) {
			return false;
		}

		const maxHeight = Math.round(window.innerHeight * MAX_VIEWPORT_RATIO);
		const currentHeight = box.getBoundingClientRect().height;
		const overflow = scroller.scrollHeight - scroller.clientHeight;

		let target = currentHeight;

		if (overflow > OVERFLOW_THRESHOLD) {
			target = currentHeight + overflow;
		}

		target = Math.min(Math.ceil(target), maxHeight);

		if (Math.abs(target - currentHeight) <= OVERFLOW_THRESHOLD) {
			return false;
		}

		box.dataset.amaranthHeight = String(target);
		applyHeight(box, dialog, target);
		guardHeight(box, dialog);
		console.debug('[amaranth-tweaks] resized popup to ' + target + 'px');

		return true;
	}

	function processDialog(node: Node): void {
		if (!isTargetDialog(node)) {
			return;
		}

		const dialog: HTMLElement = node;

		if (fitDialog(dialog)) {
			return;
		}

		/** The receipt is fetched after the popup opens, so retry briefly until the content is present (give up after ~3s). */
		let tries = 0;

		const timer = window.setInterval(
			() => {
				tries += 1;

				if (fitDialog(dialog) || tries >= 30 || !dialog.isConnected) {
					window.clearInterval(timer);
				}
			},
			100
		);
	}

	function scan(root: Document | Element): void {
		if (isTargetDialog(root)) {
			processDialog(root);

			return;
		}

		for (const dialog of root.querySelectorAll<HTMLElement>(DIALOG_SELECTOR)) {
			processDialog(dialog);
		}
	}

	/**
	 * The popup mounts as a direct child of <body>.
	 * If a future target mounts deeper in the tree, add `subtree: true` here.
	 */
	const bodyObserver = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node.nodeType === Node.ELEMENT_NODE) {
					scan(node as Element);
				}
			}
		}
	});

	bodyObserver.observe(document.body, { childList: true });

	/** Re-fit whatever is open when the window is resized. */
	let resizeTimer = 0;

	window.addEventListener(
		'resize',
		() => {
			window.clearTimeout(resizeTimer);

			resizeTimer = window.setTimeout(
				() => {
					for (const dialog of document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR)) {
						if (isTargetDialog(dialog)) {
							fitDialog(dialog);
						}
					}
				},
				150
			);
		}
	);

	// Handle a popup that is already open when the script loads.
	scan(document);

	console.info('[amaranth-tweaks] active on ' + location.host);
})();
