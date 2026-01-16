// ===========================================
// SUPABASE CONFIGURATION
// ===========================================
const SUPABASE_URL = 'https://bxhrnnwfqlsoviysqcdw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4aHJubndmcWxzb3ZpeXNxY2R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3ODkzNDIsImV4cCI6MjA4MTM2NTM0Mn0.O7fpv0TrDd-8ZE3Z9B5zWyAuWROPis5GRnKMxmqncX8';

// Initialize Supabase
let supabaseclient;
let isSupabaseConnected = false;

try {
    supabaseclient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase initialized successfully");
    
    // Test connection
    testSupabaseConnection();
} catch (error) {
    console.error("Supabase initialization error:", error);
    showError("Koneksi database gagal. Menggunakan penyimpanan lokal.");
}

async function testSupabaseConnection() {
    try {
        const { data, error } = await supabaseclient
            .from('namatable_orablast')
            .select('*')
            .limit(1);
            
        if (error) throw error;
        
        isSupabaseConnected = true;
        updateConnectionStatus(true);
        console.log("Supabase connected successfully");
    } catch (error) {
        console.warn("Supabase not connected, using local storage:", error);
        isSupabaseConnected = false;
        updateConnectionStatus(false);
    }
}

function updateConnectionStatus(connected) {
    const status = document.getElementById('connection-status');
    if (status) {
        status.style.display = 'block';
        status.className = 'connection-status ' + (connected ? 'connected' : 'disconnected');
        status.textContent = connected ? '✅ Terhubung ke server' : '⚠️ Mode offline (penyimpanan lokal)';
        
        setTimeout(() => {
            status.style.display = 'none';
        }, 3000);
    }
}

// ===========================================
// AUDIO SYSTEM
// ===========================================
const bgMusic = new Audio('lagu1.mp3');
const placeSound = new Audio('lagu2.mp3');
const clearSound = new Audio('lagu3.mp3');

// Audio settings
bgMusic.loop = true;
bgMusic.volume = 0.3;
placeSound.volume = 0.5;
clearSound.volume = 0.7;

let soundEnabled = localStorage.getItem('bb_sound') !== 'false';
let currentPage = 'menu';

function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('bb_sound', soundEnabled);
    updateSoundButton();
    
    if (soundEnabled) {
        // Play music if we're in menu or game
        if (currentPage === 'page-menu' || currentPage === 'page-game') {
            bgMusic.play().catch(e => console.log("Audio play failed:", e));
        }
    } else {
        bgMusic.pause();
        bgMusic.currentTime = 0;
    }
}

function updateSoundButton() {
    const btn = document.querySelector('.sound-control');
    if (btn) {
        btn.textContent = soundEnabled ? '🔊 SUARA ON' : '🔇 SUARA OFF';
    }
}

// ===========================================
// GAME VARIABLES
// ===========================================
let myId = localStorage.getItem('bb_name') || "Guest_" + Math.floor(1000 + Math.random()*9000);
localStorage.setItem('bb_name', myId);

let score = 0;
let boardState = Array(9).fill().map(() => Array(9).fill(null));
let trayPieces = [];
let activePiece = null;
let feedbackCount = 0;
let currentLeaderboardTab = 'global';

const shapes = [
    { g: [[1,1,1],[1,1,1],[1,1,1]], c: 'c-red' },
    { g: [[1,1],[1,1]], c: 'c-blue' },
    { g: [[1,1,1,1]], c: 'c-green' },
    { g: [[1,1,1],[0,1,0]], c: 'c-purple' },
    { g: [[1,1,1],[1,0,0],[1,0,0]], c: 'c-yellow' },
    { g: [[1,1,1],[1,1,1]], c: 'c-blue' },
    { g: [[1]], c: 'c-green' }
];

// ===========================================
// SUPABASE LEADERBOARD FUNCTIONS
// ===========================================
async function saveScoreToSupabase() {
    if (!isSupabaseConnected) {
        console.log("Supabase not connected, saving to local storage");
        saveScoreToLocalStorage();
        return;
    }

    try {
        // Generate device ID if not exists
        let deviceId = localStorage.getItem('bb_deviceId');
        if (!deviceId) {
            deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('bb_deviceId', deviceId);
        }

        const scoreData = {
            player_name: myId,
            score: score,
            device_id: deviceId,
            created_at: new Date().toISOString()
        };

        const { data, error } = await supabaseclient
            .from('namatable_orablast')
            .insert([scoreData]);

        if (error) throw error;

        console.log("Score saved to Supabase:", data);
        
        // Also save locally as backup
        saveScoreToLocalStorage();
        
    } catch (error) {
        console.error("Error saving score to Supabase:", error);
        showError("Gagal menyimpan skor ke server. Skor disimpan lokal.");
        saveScoreToLocalStorage();
    }
}

async function getGlobalLeaderboard() {
    if (!isSupabaseConnected) {
        console.log("Supabase not connected, using local storage");
        return getLocalLeaderboard();
    }

    try {
        showLoading(true);
        clearError();
        
        const { data, error } = await supabaseclient
            .from('namatable_orablast')
            .select('*')
            .order('score', { ascending: false })
            .limit(20);

        if (error) throw error;

        console.log("Fetched global leaderboard:", data);
        return data.map(item => ({
            name: item.player_name,
            score: item.score,
            date: new Date(item.created_at),
            device_id: item.device_id
        }));
        
    } catch (error) {
        console.error("Error getting global leaderboard:", error);
        showError("Gagal memuat peringkat global. Menampilkan data lokal.");
        return getLocalLeaderboard();
    } finally {
        showLoading(false);
    }
}

async function getMyScores() {
    if (!isSupabaseConnected) {
        return getMyLocalScores();
    }

    try {
        showLoading(true);
        clearError();
        
        const deviceId = localStorage.getItem('bb_deviceId');
        if (!deviceId) {
            return getMyLocalScores();
        }

        const { data, error } = await supabaseclient
            .from('namatable_orablast')
            .select('*')
            .eq('device_id', deviceId)
            .order('score', { ascending: false })
            .limit(10);

        if (error) throw error;

        return data.map(item => ({
            name: item.player_name,
            score: item.score,
            date: new Date(item.created_at),
            device_id: item.device_id
        }));
        
    } catch (error) {
        console.error("Error getting my scores:", error);
        showError("Gagal memuat skor Anda. Menampilkan data lokal.");
        return getMyLocalScores();
    } finally {
        showLoading(false);
    }
}

async function getTopPlayers() {
    if (!isSupabaseConnected) {
        return getLocalLeaderboard();
    }

    try {
        showLoading(true);
        clearError();
        
        // Get top 10 scores, group by highest score per player
        const { data, error } = await supabaseclient
            .from('namatable_orablast')
            .select('player_name, score, created_at, device_id')
            .order('score', { ascending: false })
            .limit(100);

        if (error) throw error;

        // Group by player and get their highest score
        const playerMap = new Map();
        data.forEach(item => {
            const playerName = item.player_name;
            if (!playerMap.has(playerName) || playerMap.get(playerName).score < item.score) {
                playerMap.set(playerName, {
                    name: playerName,
                    score: item.score,
                    date: new Date(item.created_at),
                    device_id: item.device_id
                });
            }
        });

        // Convert to array and sort
        const topPlayers = Array.from(playerMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, 20);

        return topPlayers;
        
    } catch (error) {
        console.error("Error getting top players:", error);
        return getLocalLeaderboard();
    } finally {
        showLoading(false);
    }
}

// ===========================================
// LOCAL STORAGE FALLBACK
// ===========================================
function saveScoreToLocalStorage() {
    let userScores = JSON.parse(localStorage.getItem('bb_user_scores') || "[]");
    
    userScores.push({
        name: myId,
        score: score,
        date: new Date().toISOString()
    });
    
    userScores.sort((a, b) => b.score - a.score);
    userScores = userScores.slice(0, 10);
    
    localStorage.setItem('bb_user_scores', JSON.stringify(userScores));
}

function getLocalLeaderboard() {
    const userScores = JSON.parse(localStorage.getItem('bb_user_scores') || "[]");
    return userScores.map(scoreData => ({
        name: scoreData.name,
        score: scoreData.score,
        date: new Date(scoreData.date)
    }));
}

function getMyLocalScores() {
    return getLocalLeaderboard(); // For local, it's the same
}

// ===========================================
// UI FUNCTIONS
// ===========================================
function showPage(id) { 
    currentPage = id;
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden')); 
    document.getElementById(id).classList.remove('hidden');
    
    // Sound control
    if (soundEnabled) {
        if (id === 'page-game' || id === 'page-menu') {
            bgMusic.play().catch(e => console.log("Audio play failed:", e));
        } else {
            bgMusic.pause();
        }
    }
    
    if(id === 'page-menu') {
        document.getElementById('user-display').innerText = "Player: " + myId;
    }
    if(id === 'page-lead') {
        document.getElementById('name-input').value = myId;
        showGlobalRank();
    }
}

function goToMenu() { 
    if (soundEnabled) {
        bgMusic.play().catch(e => console.log("Audio play failed:", e));
    }
    showPage('page-menu'); 
}

function goToLead() { showPage('page-lead'); }

function exitApp() { 
    if(confirm("Keluar dari tab ini?")) window.close(); 
}

function updateName() {
    const val = document.getElementById('name-input').value.trim();
    if(val) { 
        myId = val; 
        localStorage.setItem('bb_name', myId);
        
        // Update current display
        const userDisplay = document.getElementById('user-display');
        if (userDisplay) {
            userDisplay.innerText = "Player: " + myId;
        }
        
        // Refresh leaderboard
        if (currentLeaderboardTab === 'global') {
            showGlobalRank();
        } else {
            showMyRank();
        }
    }
}

function showGlobalRank() {
    currentLeaderboardTab = 'global';
    updateTabButtons();
    renderLeaderboard('global');
}

function showMyRank() {
    currentLeaderboardTab = 'my';
    updateTabButtons();
    renderLeaderboard('my');
}

function updateTabButtons() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (currentLeaderboardTab === 'global') {
        document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
    } else {
        document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
    }
}

async function renderLeaderboard(type) {
    const leadList = document.getElementById('lead-list');
    
    let scores = [];
    if (type === 'global') {
        scores = await getTopPlayers();
    } else {
        scores = await getMyScores();
    }
    
    if (scores.length === 0) {
        leadList.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 4rem; color: #ccc;">🏆</div>
                <p>${type === 'global' ? 'Belum ada skor di peringkat global' : 'Belum ada skor yang disimpan'}</p>
                <p style="font-size: 0.9rem; margin-top: 10px;">Mulai bermain untuk menambahkan skor!</p>
            </div>
        `;
        return;
    }
    
    const currentDeviceId = localStorage.getItem('bb_deviceId');
    
    leadList.innerHTML = scores.map((scoreData, index) => {
        const date = new Date(scoreData.date);
        const dateStr = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth()+1).toString().padStart(2, '0')}/${date.getFullYear()}`;
        const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        
        // Check if this is current user (by device ID or name match)
        const isCurrentUser = scoreData.device_id === currentDeviceId || 
                             (type === 'my' && scoreData.name === myId);
        
        // Medal emojis for top 3
        let medal = '';
        if (index < 3 && type === 'global') {
            const medals = ['🥇', '🥈', '🥉'];
            medal = `<span class="rank-medal ${['gold', 'silver', 'bronze'][index]}">${medals[index]}</span>`;
        }
        
        return `
            <div class="rank-row ${isCurrentUser ? 'is-me' : ''}">
                <div class="rank-number">
                    ${medal || `#${index + 1}`}
                </div>
                <div class="rank-info">
                    <div class="rank-name">
                        ${scoreData.name} ${isCurrentUser ? '<span style="color: #007bff; font-size: 0.9rem;">(Anda)</span>' : ''}
                    </div>
                    <div class="rank-date">${dateStr} ${timeStr}</div>
                </div>
                <div class="rank-score">${scoreData.score}</div>
            </div>
        `;
    }).join('');
}

function showLoading(show) {
    const loading = document.getElementById('loading-indicator');
    if (loading) {
        loading.style.display = show ? 'block' : 'none';
    }
}

function showError(message) {
    const errorEl = document.getElementById('error-message');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        
        setTimeout(() => {
            errorEl.style.display = 'none';
        }, 5000);
    }
}

function clearError() {
    const errorEl = document.getElementById('error-message');
    if (errorEl) {
        errorEl.style.display = 'none';
    }
}

// ===========================================
// GAME LOGIC FUNCTIONS
// ===========================================
function saveProgress() {
    localStorage.setItem('bb_savegame', JSON.stringify({ score, boardState, trayPieces }));
}

function startOrResume() {
    const saved = localStorage.getItem('bb_savegame');
    showPage('page-game');
    if(saved) {
        const data = JSON.parse(saved);
        score = data.score; 
        boardState = data.boardState; 
        trayPieces = data.trayPieces;
        resumeGame();
    } else { 
        restartGame(); 
    }
}

function resumeGame() {
    document.getElementById('score-display').innerText = score;
    renderBoard();
    renderTray();
}

function restartGame() {
    score = 0; 
    boardState = Array(9).fill().map(() => Array(9).fill(null));
    trayPieces = []; 
    document.getElementById('score-display').innerText = "0";
    renderBoard(); 
    spawnTray();
}

function renderBoard() {
    const b = document.getElementById('board'); 
    b.innerHTML = '';
    
    for(let r=0; r<9; r++) {
        for(let c=0; c<9; c++) {
            const d = document.createElement('div');
            d.className = 'cell' + (boardState[r][c] ? ' ' + boardState[r][c] : '');
            d.id = `cell-${r}-${c}`;
            b.appendChild(d);
        }
    }
}

function spawnTray() {
    trayPieces = [];
    
    for(let i=0; i<3; i++) {
        let validShapeFound = false;
        let attempts = 0;
        let selectedShape = null;

        while(!validShapeFound && attempts < 50) {
            selectedShape = shapes[Math.floor(Math.random() * shapes.length)];
            if(checkIfFitsAnywhere(selectedShape.g)) {
                validShapeFound = true;
            }
            attempts++;
        }
        
        trayPieces.push(validShapeFound ? selectedShape : shapes[6]);
    }
    
    renderTray();
    saveProgress();
}

function checkIfFitsAnywhere(g) {
    for(let r=0; r<9; r++) {
        for(let c=0; c<9; c++) {
            if(canFit(g, r, c)) return true;
        }
    }
    return false;
}

function renderTray() {
    const t = document.getElementById('tray'); 
    t.innerHTML = '';
    
    trayPieces.forEach((s, idx) => {
        if(!s) return;
        
        const cont = document.createElement('div');
        const p = document.createElement('div');
        p.style.display = 'grid';
        p.style.gridTemplateColumns = `repeat(${s.g[0].length}, var(--cell-size))`;
        
        s.g.forEach(row => {
            row.forEach(v => {
                const c = document.createElement('div');
                c.className = v ? `p-cell ${s.c}` : '';
                if(!v) { 
                    c.style.width = 'var(--cell-size)'; 
                    c.style.height = 'var(--cell-size)'; 
                    c.style.visibility = 'hidden'; 
                }
                p.appendChild(c);
            });
        });

        cont.appendChild(p); 
        t.appendChild(cont);

        cont.onpointerdown = (e) => {
            activePiece = { el: cont, shape: s, index: idx };
            cont.classList.add('dragging');
            cont.setPointerCapture(e.pointerId);
        };
        
        cont.onpointermove = (e) => {
            if(!activePiece) return;
            cont.style.left = (e.clientX - 60) + 'px';
            cont.style.top = (e.clientY - 120) + 'px';
            showGhost(e.clientX, e.clientY);
        };
        
        cont.onpointerup = (e) => {
            if(!activePiece) return;
            const pos = getPos(e.clientX, e.clientY);
            
            if(pos && canFit(s.g, pos.r, pos.c)) {
                // Play place sound
                if (soundEnabled) {
                    placeSound.currentTime = 0;
                    placeSound.play().catch(e => console.log("Place sound failed"));
                }
                
                place(s, pos.r, pos.c);
                trayPieces[idx] = null;
                cont.remove();
                checkClear();
                if(trayPieces.every(v => v === null)) spawnTray();
                saveProgress();
                
                // Check game over
                if(checkGameOver()) {
                    setTimeout(() => {
                        gameOver();
                    }, 500);
                }
            } else {
                cont.classList.remove('dragging');
                cont.style.position = 'static';
            }
            
            clearGhost(); 
            activePiece = null;
        };
    });
}

function getPos(x, y) {
    const rect = document.getElementById('board').getBoundingClientRect();
    const cs = rect.width / 9;
    const c = Math.floor((x - rect.left) / cs);
    const r = Math.floor((y - rect.top) / cs);
    return (r >= 0 && r < 9 && c >= 0 && c < 9) ? {r, c} : null;
}

function canFit(g, r, c) {
    for(let y=0; y<g.length; y++) {
        for(let x=0; x<g[y].length; x++) {
            if(g[y][x]) {
                if(r+y >= 9 || c+x >= 9 || boardState[r+y][c+x]) return false;
            }
        }
    }
    return true;
}

function place(s, r, c) {
    s.g.forEach((row, y) => {
        row.forEach((v, x) => {
            if(v) {
                boardState[r+y][c+x] = s.c;
                document.getElementById(`cell-${r+y}-${c+x}`).className = `cell ${s.c}`;
            }
        });
    });
    
    // Score for placing block
    const blockSize = s.g.flat().filter(v => v).length;
    const placeScore = blockSize * 5;
    score += placeScore;
    document.getElementById('score-display').innerText = score;
    
    // Animate score update
    showScoreAnimation(placeScore);
}

function checkClear() {
    let rowsToClear = [];
    let colsToClear = [];
    
    // Check rows
    for(let i=0; i<9; i++) {
        if(boardState[i].every(v => v !== null)) rowsToClear.push(i);
    }
    
    // Check columns
    for(let i=0; i<9; i++) {
        let colFull = true;
        for(let j=0; j<9; j++) {
            if(boardState[j][i] === null) {
                colFull = false;
                break;
            }
        }
        if(colFull) colsToClear.push(i);
    }
    
    const totalClears = rowsToClear.length + colsToClear.length;
    
    if(totalClears > 0) {
        // Play clear sound
        if (soundEnabled) {
            clearSound.currentTime = 0;
            clearSound.play().catch(e => console.log("Clear sound failed"));
        }
        
        // Show feedback based on number of clears
        showClearFeedback(totalClears);
        
        // Clear the rows and columns
        rowsToClear.forEach(r => boardState[r].fill(null));
        colsToClear.forEach(c => { 
            for(let i=0; i<9; i++) boardState[i][c] = null; 
        });
        
        // Calculate score bonus
        const clearBonus = totalClears * 150;
        score += clearBonus;
        document.getElementById('score-display').innerText = score;
        
        // Animate score update
        showScoreAnimation(clearBonus);
        
        renderBoard();
        
        saveProgress();
    }
}

function showClearFeedback(totalClears) {
    let feedbackText = "";
    let feedbackType = "";
    
    if (totalClears >= 4) {
        feedbackText = "AMAZING!";
        feedbackType = "amazing";
    } else if (totalClears >= 3) {
        feedbackText = "PERFECT!";
        feedbackType = "perfect";
    } else if (totalClears >= 2) {
        feedbackText = "GREAT!";
        feedbackType = "great";
    } else if (totalClears >= 1) {
        feedbackText = "GOOD!";
        feedbackType = "good";
    }
    
    if (feedbackText) {
        showFeedback(feedbackText, feedbackType, window.innerWidth / 2, window.innerHeight / 2 - 100);
    }
}

function checkGameOver() {
    // Check if any piece can still be placed
    for(let piece of trayPieces) {
        if(piece && checkIfFitsAnywhere(piece.g)) {
            return false;
        }
    }
    return true;
}

function gameOver() {
    // Save score to Supabase
    saveScoreToSupabase();
    
    // Clear saved game
    localStorage.removeItem('bb_savegame');
    
    // Stop background music
    if (soundEnabled) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
    }
    
    // Show game over page
    document.getElementById('final-score').innerText = score;
    showPage('page-over');
}

function showGhost(x, y) {
    clearGhost();
    const pos = getPos(x, y);
    if(pos && canFit(activePiece.shape.g, pos.r, pos.c)) {
        activePiece.shape.g.forEach((row, dr) => {
            row.forEach((v, dc) => {
                if(v) document.getElementById(`cell-${pos.r+dr}-${pos.c+dc}`).classList.add('ghost');
            });
        });
    }
}

function clearGhost() { 
    document.querySelectorAll('.cell.ghost').forEach(e => e.classList.remove('ghost')); 
}

function showFeedback(text, type, x, y) {
    feedbackCount++;
    const id = `feedback-${feedbackCount}`;
    
    const feedback = document.createElement('div');
    feedback.id = id;
    feedback.className = `feedback-text feedback-${type}`;
    feedback.innerText = text;
    feedback.style.left = x + 'px';
    feedback.style.top = y + 'px';
    
    document.body.appendChild(feedback);
    
    setTimeout(() => {
        if(document.getElementById(id)) {
            document.getElementById(id).remove();
        }
    }, 1500);
}

function showScoreAnimation(points) {
    const scoreDisplay = document.getElementById('score-display');
    const animation = document.createElement('div');
    animation.className = 'score-animation';
    animation.innerText = `+${points}`;
    animation.style.color = points >= 150 ? '#ff4757' : '#2ed573';
    
    // Position near score display
    const rect = scoreDisplay.getBoundingClientRect();
    animation.style.left = (rect.right + 10) + 'px';
    animation.style.top = (rect.top + rect.height / 2) + 'px';
    
    document.body.appendChild(animation);
    
    setTimeout(() => {
        if (animation.parentNode) {
            animation.remove();
        }
    }, 1000);
}

// ===========================================
// INITIALIZATION
// ===========================================
window.addEventListener('load', () => {
    updateSoundButton();
    goToMenu();
    
    // Auto-hide connection status after 5 seconds
    setTimeout(() => {
        const status = document.getElementById('connection-status');
        if (status) {
            status.style.display = 'none';
        }
    }, 5000);
});
