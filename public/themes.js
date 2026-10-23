// ─── Themes ───────────────────────────────────────────────────────────────────
const THEMES = [
    { name:'CLASSIC',          bg:'#f5f0e8', fg:'#1a1a1a', muted:'#888888', line:'#d0c8b8' },
    { name:'CYBER.PINK',       bg:'#0a0010', fg:'#ff007f', muted:'#660033', line:'#220011' },
    { name:'GLITCH.RED',       bg:'#0d0000', fg:'#ff2200', muted:'#661100', line:'#1a0000' },
    { name:'EARTH.WARM',       bg:'#1a1208', fg:'#d4a853', muted:'#6b5323', line:'#2a1e0c' },
    { name:'MONOCHROME',       bg:'#111111', fg:'#eeeeee', muted:'#555555', line:'#222222' },
    { name:'SYNTHWAVE',        bg:'#0d0021', fg:'#bf00ff', muted:'#5c0078', line:'#1a0033' },
    { name:'TERRACOTTA',       bg:'#1c0f0a', fg:'#e07050', muted:'#6b3020', line:'#2a1510' },
    { name:'MATRIX',           bg:'#000d00', fg:'#00ff41', muted:'#006616', line:'#001a00' },
    { name:'FOREST',           bg:'#0a1208', fg:'#4ade80', muted:'#1a5c30', line:'#0f1f0c' },
    { name:'PHOSPHOR',         bg:'#050d08', fg:'#39ff14', muted:'#185c08', line:'#0a1a0c' },
    { name:'NOIR',             bg:'#050505', fg:'#cccccc', muted:'#444444', line:'#111111' },
    { name:'ULTRA.VIOLET',     bg:'#08001a', fg:'#7c3aed', muted:'#3b1870', line:'#110026' },
    { name:'NEON.WIRE',        bg:'#000a0d', fg:'#00e5ff', muted:'#005566', line:'#001519' },
    { name:'SAGE',             bg:'#0e1210', fg:'#a3c4a0', muted:'#3d5c3a', line:'#161e14' },
    { name:'DEEP.SPACE',       bg:'#020408', fg:'#c0d8f0', muted:'#304060', line:'#060c14' },
    { name:'AURORA',           bg:'#050e0a', fg:'#80ffcc', muted:'#206644', line:'#0a1a12' },
    { name:'VAPORWAVE',        bg:'#0d0018', fg:'#ff80cc', muted:'#660055', line:'#1a0028' },
    { name:'ACID',             bg:'#050500', fg:'#dfff11', muted:'#555500', line:'#0d0d00' },
    { name:'TERRACOTTA.LIGHT', bg:'#f0e0d0', fg:'#8b4513', muted:'#c08060', line:'#d8c0a8' },
];

const CYCLE_MS = 6 * 60 * 60 * 1000; // 6 hours

function getThemeIndex() {
    // Allow ?theme=N override
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('theme');
    if (forced !== null) {
        const n = parseInt(forced);
        if (!isNaN(n) && n >= 0 && n < THEMES.length) return n;
    }
    return Math.floor(Date.now() / CYCLE_MS) % THEMES.length;
}

function applyTheme(t) {
    const root = document.documentElement;
    root.style.setProperty('--bg', t.bg);
    root.style.setProperty('--fg', t.fg);
    root.style.setProperty('--muted', t.muted);
    root.style.setProperty('--light-line', t.line);
}
