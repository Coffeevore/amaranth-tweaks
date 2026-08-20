/**
 * Un-clip the rich-text editor in e-approval forms on Firefox.
 * The form body is a table cell whose CSS height is smaller than the editor it holds, and the editor's wrapper asks for `height: 100%`.
 * Blink resolves that percentage against the cell's content-grown height, so everything fits; Gecko resolves it against the cell's *specified* height, so the taller editor overflows its row and the blocks below paint over its bottom edge — swallowing the totals row and the editor's own view tabs.
 * Taking the wrapper off percentage heights makes Gecko content-size the row exactly like Blink, and changes nothing in Blink, so this ships unconditionally rather than sniffing the engine.
 */

/** The editor wrapper inside the approval form's body cell; the `height: 100%` we need to beat is inline on it. */
const EDITOR_AREA_SELECTOR = '#divFormContents .editor_area';

const STYLE_ID = 'amaranth-editor-area-style';

/** Register the height override once; a stylesheet `!important` outranks the wrapper's plain inline height. */
export function initUnclipEditor(): void {
	if (document.getElementById(STYLE_ID) !== null) {
		return;
	}

	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `${EDITOR_AREA_SELECTOR} { height: auto !important; }`;

	document.head.appendChild(style);
}
