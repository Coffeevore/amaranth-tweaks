/**
 * Attendance badge: fetch today's check-in time and show it next to the user's name in the header.
 * Kept separate from the popup resizer — the two features share nothing but the host page.
 */

const ENDPOINT = 'https://gw.okestro.com/human/hrd0280/0hr00001';

/** The groupware stashes the bearer token in this (URL-encoded) cookie; the API wants it echoed back as `Authorization`. */
const TOKEN_COOKIE = 'oAuthToken';

/** The API also demands a signed request keyed by this cookie; without the signature the server answers 401 (resultCode 136). */
const SIGN_KEY_COOKIE = 'signKey';

/** The endpoint's path is folded into the signed message; query strings are excluded, and this URL carries none. */
const ENDPOINT_PATH = new URL(ENDPOINT).pathname;

/** The name span in the header user-info button; the time hangs off this element. */
const NAME_SELECTOR = '#userInfoPopupBtn .user-info .v-box .name_txt';

/** Attribute we set on the name span; a matching `::after` rule renders its value, so React never sees a foreign node. */
const TIME_ATTRIBUTE = 'data-amaranth-come-time';

const STYLE_ID = 'amaranth-come-time-style';

/** Re-fetch cadence while the tab stays open. Check-in time changes at most once a day, so hourly is plenty. */
const REFRESH_INTERVAL = 60 * 60 * 1000;

/** Ignore a visibility-triggered re-fetch if we already fetched this recently (background tabs throttle the interval). */
const VISIBILITY_MIN_GAP = 30 * 60 * 1000;

type AttendanceRecord = {
	comeTm?: string;
};

type AttendanceResponse = {
	resultCode?: number;
	resultData?: AttendanceRecord[];
};

/** The outcome of one attendance fetch: a dead session (stop probing) or a live one that may or may not carry a check-in time. */
type FetchOutcome =
	| { alive: true; time: string | null }
	| { alive: false };

/** The formatted time we want on screen, cached so we can re-assert it when the header re-renders. */
let current = '';

let lastFetchAt = 0;

/** Handle for the refresh interval, so a dead session can cancel it; 0 when nothing is scheduled. */
let intervalId = 0;

/** The visibility listener, kept so `stop()` can detach it; null before init and after teardown. */
let visibilityHandler: (() => void) | null = null;

/** Today as `yyyyMMdd`, matching the API's `atDt`. */
function today(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');

	return String(year) + month + day;
}

/** `202607010943` -> `2026-07-01 09:43`, or null if it isn't a 12-digit stamp (e.g. not checked in yet). */
function formatComeTime(raw: string): string | null {
	if (!/^\d{12}$/.test(raw)) {
		return null;
	}

	const year = raw.slice(0, 4);
	const month = raw.slice(4, 6);
	const day = raw.slice(6, 8);
	const hour = raw.slice(8, 10);
	const minute = raw.slice(10, 12);

	return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
}

/** Read a browser cookie by name, URL-decoded, or null if it isn't set. */
function readCookie(name: string): string | null {
	const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
	if (match === null) {
		return null;
	}

	return decodeURIComponent(match[1]);
}

/** A 32-hex-character request id, sent as the `transaction-id` header and folded into the signature. */
function makeTransactionId(): string {
	const chunk = () => (((1 + Math.random()) * 0x10000) | 0).toString(16).slice(1);

	return chunk() + chunk() + chunk() + chunk() + chunk() + chunk() + chunk() + chunk();
}

/** Base64-encoded HMAC-SHA256 of `token + transactionId + timestamp + path`, keyed by the sign-key cookie. */
async function signRequest(token: string, transactionId: string, timestamp: number, signKey: string): Promise<string> {
	const message = token + transactionId + String(timestamp) + ENDPOINT_PATH;
	const encoder = new TextEncoder();

	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(signKey),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));

	return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/** POST for today's own attendance (admin: false scopes it to the current user); the result reports whether the session is still alive and carries the check-in time when there is one. */
async function fetchComeTime(): Promise<FetchOutcome> {
	const token = readCookie(TOKEN_COOKIE);
	const signKey = readCookie(SIGN_KEY_COOKIE);
	if (token === null || signKey === null) {
		return { alive: false };
	}

	const payload = {
		atDt: today(),
		empCds: [],
		deptCds: [],
		divCds: [],
		prtyCds: [],
		workTps: [],
		atItemCds: [],
		atCds: [],
		admin: false,
	};

	const transactionId = makeTransactionId();
	const timestamp = Math.floor(Date.now() / 1000);

	let signature: string;

	try {
		signature = await signRequest(token, transactionId, timestamp, signKey);
	} catch {
		return { alive: true, time: null };
	}

	let response: Response;

	try {
		response = await fetch(
			ENDPOINT,
			{
				method: 'POST',
				credentials: 'omit',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Bearer ' + token,
					'transaction-id': transactionId,
					'timestamp': String(timestamp),
					'wehago-sign': signature,
				},
				body: JSON.stringify(payload),
			}
		);
	} catch {
		return { alive: true, time: null };
	}

	// A rejected token comes back as 401 — the one response that means the session itself is gone, so stop probing.
	if (response.status === 401) {
		return { alive: false };
	}

	if (!response.ok) {
		return { alive: true, time: null };
	}

	let data: AttendanceResponse;

	try {
		data = await response.json() as AttendanceResponse;
	} catch {
		return { alive: true, time: null };
	}

	// A valid session with no check-in yet returns resultCode 0 and an empty list; that is alive, just nothing to show.
	if (data.resultCode !== 0 || !Array.isArray(data.resultData) || data.resultData.length === 0) {
		return { alive: true, time: null };
	}

	const time = formatComeTime(data.resultData[0].comeTm ?? '');

	return { alive: true, time };
}

/** Register the `::after` rule once, so the time renders wherever the attribute lands. */
function ensureStyle(): void {
	if (document.getElementById(STYLE_ID) !== null) {
		return;
	}

	const style = document.createElement('style');
	style.id = STYLE_ID;
	style.textContent = `${NAME_SELECTOR}[${TIME_ATTRIBUTE}]::after { content: attr(${TIME_ATTRIBUTE}); margin-left: 0.5em; font-size: 0.85em; font-weight: normal; opacity: 0.7; }`;

	document.head.appendChild(style);
}

/** Put the cached time on the header name span; no-ops until we have a value and the span exists. */
function apply(): void {
	if (current === '') {
		return;
	}

	const name = document.querySelector(NAME_SELECTOR);
	if (name === null) {
		return;
	}

	if (name.getAttribute(TIME_ATTRIBUTE) !== current) {
		name.setAttribute(TIME_ATTRIBUTE, current);
	}
}

/** Tear down the refresh schedule for good, once the session is dead — further probes would only be rejected. A fresh login reloads the page, which re-runs this script and re-arms everything. */
function stop(): void {
	if (intervalId !== 0) {
		window.clearInterval(intervalId);
		intervalId = 0;
	}

	if (visibilityHandler !== null) {
		document.removeEventListener('visibilitychange', visibilityHandler);
		visibilityHandler = null;
	}
}

async function refresh(): Promise<void> {
	lastFetchAt = Date.now();

	const outcome = await fetchComeTime();
	if (!outcome.alive) {
		stop();

		return;
	}

	if (outcome.time === null) {
		return;
	}

	current = outcome.time;
	apply();
}

/** Wire up the badge: style, a self-healing observer for header re-renders, and the refresh schedule. */
export function initAttendance(): void {
	ensureStyle();

	let pending = false;

	const observer = new MutationObserver(
		() => {
			if (pending) {
				return;
			}

			pending = true;

			window.setTimeout(
				() => {
					pending = false;
					apply();
				},
				250
			);
		}
	);

	observer.observe(document.body, { childList: true, subtree: true });

	const handler = () => {
		if (document.visibilityState !== 'visible') {
			return;
		}

		if (Date.now() - lastFetchAt >= VISIBILITY_MIN_GAP) {
			void refresh();
		}
	};

	visibilityHandler = handler;
	document.addEventListener('visibilitychange', handler);

	intervalId = window.setInterval(refresh, REFRESH_INTERVAL);
	void refresh();
}
