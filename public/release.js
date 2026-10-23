// Release countdown and streaming buttons, shared by the homepage and /backofdaback
window.SkellyRelease = (function() {
    const safeHref = u => /^https?:/i.test(String(u || '').trim()) ? String(u).trim() : null;

    function msLeft(r) {
        return new Date(r.releaseAt).getTime() - Date.now();
    }

    // 4D 03H 12M 09S
    function countdown(ms) {
        const s = Math.max(0, Math.floor(ms / 1000));
        const pad = n => String(n).padStart(2, '0');
        const d = Math.floor(s / 86400);
        return `${d}D ${pad(Math.floor(s / 3600) % 24)}H ${pad(Math.floor(s / 60) % 60)}M ${pad(s % 60)}S`;
    }

    // OCT 27 // 11PM CT
    function dateLabel(r) {
        const at = new Date(r.releaseAt);
        const day = at.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });
        const time = at.toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
            .replace(':00', '').replace(' ', '');
        return `${day} // ${time} CT`.toUpperCase();
    }

    // Before the drop: pre-save buttons (only the ones that have links).
    // After: the song links, falling back to the artist pages.
    function buttons(r, cfg) {
        if (msLeft(r) > 0) {
            return [
                { label: 'PRE-SAVE ON SPOTIFY', href: safeHref(r.presaveUrl) || safeHref(r.spotifyUrl) },
                { label: 'PRE-ADD ON APPLE MUSIC', href: safeHref(r.appleUrl) },
            ].filter(b => b.href);
        }
        return [
            { label: 'SPOTIFY', href: safeHref(r.spotifyUrl) || safeHref(cfg.spotifyUrl) },
            { label: 'APPLE MUSIC', href: safeHref(r.appleUrl) || safeHref(cfg.appleMusicUrl) },
        ].filter(b => b.href);
    }

    return { msLeft, countdown, dateLabel, buttons };
})();
