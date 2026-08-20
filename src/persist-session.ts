/**
 * Persist the groupware's auth cookies across browser restarts.
 * The server hands them out as session cookies (no expiry), so quitting the browser drops them and forces a fresh login even while the server-side session is still valid.
 * We re-write the same cookies with an expiry pinned to the server's own session deadline: a restart then keeps you logged in for whatever remains of that window, and never a second longer.
 */

/** The auth cookies the signed API calls and the app's login state ride on; persisted as a set, since a partial set just breaks auth. */
const SESSION_COOKIES = ['oAuthToken', 'signKey', 'BIZCUBE_AT', 'BIZCUBE_HK', 'BIZCUBE_TYPE'];

/** Read a cookie's raw (still URL-encoded) value, or null; we re-write the stored form verbatim, so this must not decode. */
function readRawCookie(name: string): string | null {
	const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
	if (match === null) {
		return null;
	}

	return match[1];
}

/** The server session deadline (`loginDate + sessionTime`) as a Date, or null when the session info isn't readable. */
function sessionDeadline(): Date | null {
	const raw = window.sessionStorage.getItem('userInfo');
	if (raw === null) {
		return null;
	}

	let info: { loginDate?: string; sessionTime?: string };

	try {
		info = JSON.parse(raw) as { loginDate?: string; sessionTime?: string };
	} catch {
		return null;
	}

	if (typeof info.loginDate !== 'string' || typeof info.sessionTime !== 'string') {
		return null;
	}

	// loginDate is the server's KST wall-clock; pin the offset so the deadline doesn't drift with the viewer's timezone.
	const login = new Date(info.loginDate.replace(' ', 'T') + '+09:00');
	const seconds = Number(info.sessionTime);
	if (Number.isNaN(login.getTime()) || Number.isNaN(seconds)) {
		return null;
	}

	return new Date(login.getTime() + seconds * 1000);
}

/** Re-write every present session cookie with the given expiry, matching its host-only/secure/lax attributes so it overwrites in place instead of forking a duplicate. */
function persistCookies(deadline: Date): void {
	const expires = deadline.toUTCString();

	for (const name of SESSION_COOKIES) {
		const value = readRawCookie(name);
		if (value === null) {
			continue;
		}

		document.cookie = `${name}=${value}; path=/; expires=${expires}; secure; samesite=lax`;
	}
}

/** Persist the cookies now and whenever the tab regains focus; a no-op whenever the deadline is unreadable or already past. */
export function initSessionPersistence(): void {
	const apply = () => {
		const deadline = sessionDeadline();
		if (deadline === null || deadline.getTime() <= Date.now()) {
			return;
		}

		persistCookies(deadline);
	};

	apply();

	document.addEventListener(
		'visibilitychange',
		() => {
			if (document.visibilityState === 'visible') {
				apply();
			}
		}
	);
}
