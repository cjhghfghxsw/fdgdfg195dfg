
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const config = require('./config.json');
const axios = require('axios');
const cors = require('cors');
const { nanoid } = require('nanoid');
const fs = require('fs/promises');

const app = express();
const PORT = 3000; // Or your preferred port like 20568

const rankHierarchy = {
    'default': 0,
    'mod': 1,
    'srmod': 2,
    'admin': 3,
    'headadmin': 4,
    'manager': 5,
    'owner': 6
};

const dbPool = mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const sessionStore = new MySQLStore({
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 86400000,
    createDatabaseTable: true,
    schema: {
        tableName: 'web_sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
}, dbPool);

app.use(session({
    secret: 'a-very-secret-key-that-you-should-change',
    resave: false,
    saveUninitialized: true,
    store: sessionStore,
    cookie: { 
        secure: false,
        maxAge: 86400000
    }
}));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- HELPER FUNCTIONS & MIDDLEWARE ---

async function sendSyncCommand() {
    try {
        console.log('[Plugin] Sending sync request to the game server...');
        await axios.post(config.PLUGIN_SYNC_URL, {
            secretKey: config.PLUGIN_SECRET_KEY
        });
        console.log('[Plugin] Sync request sent successfully.');
    } catch (error) {
        console.error('[Plugin] Failed to send sync request:', error.message);
    }
}

const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.status(401).json({ error: 'Not authenticated' });
};

const isStaff = (req, res, next) => {
    if (req.session.user) {
        const staffRanks = ['mod', 'srmod', 'admin', 'headadmin', 'manager', 'owner'];
        if (staffRanks.includes(req.session.user.primary_group)) {
            return next();
        }
    }
    res.status(404).sendFile(path.join(__dirname, 'public', 'html', '404.html'));
};

const isAdmin = (req, res, next) => {
    if (req.session.user) {
        const adminRanks = ['admin', 'headadmin', 'manager', 'owner'];
        if (adminRanks.includes(req.session.user.primary_group)) {
            return next();
        }
    }
    res.status(404).sendFile(path.join(__dirname, 'public', 'html', '404.html'));
};

const isSeniorStaff = (req, res, next) => {
    if (req.session.user) {
        const seniorStaffRanks = ['srmod', 'admin', 'headadmin', 'manager', 'owner'];
        if (seniorStaffRanks.includes(req.session.user.primary_group)) {
            return next();
        }
    }
    res.status(404).sendFile(path.join(__dirname, 'public', 'html', '404.html'));
};

function parseMinecraftColors(permissionString) {
    const colorMap = {
        '&0': '#000000', '&1': '#0000AA', '&2': '#00AA00', '&3': '#00AAAA',
        '&4': '#AA0000', '&5': '#AA00AA', '&6': '#FFAA00', '&7': '#AAAAAA',
        '&8': '#555555', '&9': '#5555FF', '&a': '#55FF55', '&b': '#55FFFF',
        '&c': '#FF5555', '&d': '#FF55FF', '&e': '#FFFF55', '&f': '#FFFFFF'
    };
    let style = '';
    let primaryColor = null;
    const colorCodes = permissionString.match(/&[0-9a-fk-or]/g) || [];
    
    colorCodes.forEach(code => {
        if (colorMap[code]) {
            if (!primaryColor) primaryColor = colorMap[code];
            style += `color: ${colorMap[code]};`;
        }
        if (code === '&l') style += 'font-weight: bold;';
        if (code === '&o') style += 'font-style: italic;';
        if (code === '&n') style += 'text-decoration: underline;';
        if (code === '&m') style += 'text-decoration: line-through;';
    });
    return { style, hexColor: primaryColor };
}

// --- TRANSCRIPT BACKEND ROUTES ---
app.use('/transcripts', express.static(path.join(__dirname, 'public', 'transcripts')));

app.post('/upload-transcript', async (req, res) => {
    const { html, ticketId } = req.body;
    if (!html || !ticketId) {
        return res.status(400).json({ error: 'Missing html content or ticketId.' });
    }
    try {
        const fileName = `transcript-${ticketId}-${nanoid(8)}.html`;
        const filePath = path.join(__dirname, 'public', 'transcripts', fileName);

        await fs.writeFile(filePath, html);
        console.log(`Successfully saved transcript: ${fileName}`);
        
        res.status(200).json({ 
            message: 'Transcript uploaded successfully.',
            url: `${process.env.TRANSCRIPT_VIEW_URL}${fileName}`
        });
    } catch (error) {
        console.error('Error saving transcript:', error);
        res.status(500).json({ error: 'Failed to save transcript.' });
    }
});

// --- PAGE ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'home.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'login.html')));
app.get('/players', (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'players.html')));
app.get('/profile/:username', (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'profile.html')));
app.get('/staff/home', isStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'my-stats.html')));
app.get('/staff/management', isAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'staff-management.html')));
app.get('/staff/management/:username', isAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'manage-staff.html')));
app.get('/staff/muted-words', isSeniorStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'muted-words.html')));
app.get('/staff/all-words', isSeniorStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'all-words.html')));
app.get('/staff/my-bans', isStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'my-bans.html')));
app.get('/staff/top-bans', isStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'top-bans.html')));
app.get('/staff/appeals', isSeniorStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'appeals.html')));
app.get('/staff/appeals/:id', isSeniorStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'view-appeal.html')));
app.get('/staff/active-bans', isSeniorStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'active-bans.html')));
app.get('/staff/active-mutes', isSeniorStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'active-mutes.html')));
app.get('/appeal', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'appeal.html')));
app.get('/report', isAuthenticated, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'report.html')));
app.get('/staff/admin-reports', isSeniorStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'admin-reports.html')));
app.get('/staff/reports-history', isSeniorStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'reports-history.html')));
app.get('/staff/admin-reports/:report_id', isSeniorStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'view-report.html')));
app.get('/mod-apply', (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'mod-apply.html')));
app.get('/staff/applications', isSeniorStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'staff-applications.html')));
app.get('/staff/applications/:id', isSeniorStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'view-staff-application.html')));
app.get('/staff/applications/view/:id', isSeniorStaff, (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'view-application.html')));
app.get('/guilds', (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'guilds.html')));
app.get('/guild/:guildName', (req, res) => res.sendFile(path.join(__dirname, 'public', 'html', 'guild-profile.html')));
// --- Serve My Friends Page ---
app.get('/my-friends', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'html', 'my-friends.html'));
});
// --- API ENDPOINTS ---

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [authRows] = await dbPool.execute('SELECT * FROM `auth_users` WHERE `username` = ?', [username]);
        if (authRows.length === 0) {
            return res.json({ success: false, message: 'Invalid username or password.' });
        }
        const userAuth = authRows[0];
        const passwordMatch = await bcrypt.compare(password, userAuth.password);

        if (passwordMatch) {
            const [playerDataRows] = await dbPool.execute(
                `SELECT lp.uuid, lp.primary_group 
                 FROM luckperms_players AS lp 
                 WHERE lp.username = ?`,
                [username]
            );

            if (playerDataRows.length === 0) {
                return res.status(404).json({ success: false, message: 'Could not find player permission data.' });
            }
            const playerData = playerDataRows[0];

            await dbPool.execute('UPDATE `auth_users` SET `is_logged_in` = 1 WHERE `username` = ?', [username]);

            req.session.user = {
                username: userAuth.username,
                ign: username,
                uuid: playerData.uuid,
                primary_group: playerData.primary_group
            };
            
            req.session.save(err => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Server error during login.' });
                }
                res.json({ success: true, message: `Successfully logged in!` });
            });
        } else {
            res.json({ success: false, message: 'Invalid username or password.' });
        }
    } catch (dbError) {
        console.error('[Server] Database or bcrypt error:', dbError);
        res.status(500).json({ success: false, message: 'A server error occurred.' });
    }
});

app.post('/logout', isAuthenticated, (req, res) => {
    const username = req.session.user.username;
    dbPool.execute('UPDATE `auth_users` SET `is_logged_in` = 0 WHERE `username` = ?', [username])
        .then(() => {
            req.session.destroy(err => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Could not log out.' });
                }
                res.clearCookie('connect.sid');
                return res.json({ success: true, message: 'Logged out successfully.' });
            });
        })
        .catch(dbError => {
            res.status(500).json({ success: false, message: 'Error during logout.' });
        });
});
app.get('/api/news', (req, res) => {
    const newsData = [
        { id: 1, title: "New Server Update v1.2!", content: "A massive update with new quests and a PVP arena.", author: "DeepMC Admin", date: "2025-07-28" },
        { id: 2, title: "Summer Event Coming Soon", content: "Get ready for exclusive items and new mini-games!", author: "DeepMC Admin", date: "2025-07-25" }
    ];
    res.json(newsData);
});
app.get('/api/my-friends', isAuthenticated, async (req, res) => {
    try {
        const playerUuid = req.session.user.uuid;
        // Get friends from the friends table
        const [rows] = await dbPool.query(
            'SELECT friend_uuid, created_at FROM friends WHERE player_uuid = ?',
            [playerUuid]
        );
        if (!rows.length) return res.json({ friends: [] });

        // Fetch friend details (username, avatar) for each friend_uuid
        const friends = [];
        for (const row of rows) {
            // Replace with your actual player table and avatar logic
            const [friendRows] = await dbPool.query(
                'SELECT username, uuid FROM auth_users WHERE uuid = ?',
                [row.friend_uuid]
            );
            if (friendRows.length) {
                const friend = friendRows[0];
friends.push({
    username: friend.username,
    uuid: row.friend_uuid, // ✅ use the one from the friends table
    avatar: `https://crafatar.com/avatars/${row.friend_uuid}?size=48`,
    since: row.created_at,
    last_seen: friend.last_login,
    rank: friend.rank_name,
    colorStyle: friend.rank_color ? `color: ${friend.rank_color}` : ''
});
            }
        }
        res.json({ friends });
    } catch (err) {
        console.error('Error fetching friends:', err);
        res.status(500).json({ error: 'Failed to fetch friends.' });
    }
});
app.post('/api/remove-friend', isAuthenticated, async (req, res) => {
    try {
        const playerUuid = req.session.user.uuid;
        const { friendId } = req.body;

        if (!friendId) {
            return res.status(400).json({ error: 'Friend ID is required' });
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(friendId)) {
            return res.status(400).json({ error: 'Invalid friend UUID format' });
        }

        // Make sure friend exists in DB
        const [friendExists] = await dbPool.query(
            'SELECT uuid FROM auth_users WHERE uuid = ? LIMIT 1',
            [friendId]
        );
        if (friendExists.length === 0) {
            return res.status(404).json({ error: 'Friend not found' });
        }

        // Remove friendship (both directions)
        const [result] = await dbPool.query(
            `DELETE FROM friends 
             WHERE (player_uuid = ? AND friend_uuid = ?)
                OR (player_uuid = ? AND friend_uuid = ?)`,
            [playerUuid, friendId, friendId, playerUuid]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'No friendship found to remove' });
        }

        res.json({ success: true, message: 'Friend removed successfully' });

    } catch (err) {
        console.error('Error removing friend:', err);
        res.status(500).json({ error: 'Failed to remove friend' });
    }
});


// Updated friends endpoint to include last_seen data
app.get('/api/my-friends', isAuthenticated, async (req, res) => {
    try {
        const playerUuid = req.session.user.uuid;

        // Single query to get friends + details
        const [rows] = await dbPool.query(`
            SELECT 
                u.username,
                u.uuid,
                u.last_login,
                pr.rank_name,
                pr.rank_color,
                f.created_at AS since
            FROM friends f
            JOIN auth_users u ON u.uuid = f.friend_uuid
            LEFT JOIN player_ranks pr ON u.rank_id = pr.id
            WHERE f.player_uuid = ?
            ORDER BY u.last_login DESC
        `, [playerUuid]);

        // Format result for frontend
        const friends = rows.map(friend => ({
            username: friend.username,
            uuid: friend.uuid,
            avatar: `https://crafatar.com/avatars/${friend.uuid}?size=48`,
            since: friend.since,
            last_seen: friend.last_login,
            rank: friend.rank_name,
            colorStyle: friend.rank_color ? `color: ${friend.rank_color}` : ''
        }));

        res.json({ friends });

    } catch (err) {
        console.error('Error fetching friends:', err);
        res.status(500).json({ error: 'Failed to fetch friends.' });
    }
});
app.get('/api/top-playtime', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const [rows] = await dbPool.execute(`
            SELECT db.ign AS username, db.playtime, lgp.permission AS suffix_permission
            FROM deepbungee AS db
            LEFT JOIN luckperms_players AS lp ON db.uuid = lp.uuid
            LEFT JOIN luckperms_group_permissions AS lgp ON lp.primary_group = lgp.name AND lgp.permission LIKE 'suffix.%'
            ORDER BY db.playtime DESC
            LIMIT 5
        `);
        const playersWithColors = rows.map(player => {
            const { style } = player.suffix_permission ? parseMinecraftColors(player.suffix_permission) : { style: '' };
            return { ...player, colorStyle: style };
        });
        res.json(playersWithColors);
    } catch (dbError) {
        res.status(500).json({ error: 'Failed to fetch top players.' });
    }
});

app.get('/api/auth/status', async (req, res) => {
    if (req.session.user) {
        try {
            const [rows] = await dbPool.execute(
                'SELECT primary_group FROM `luckperms_players` WHERE `username` = ?',
                [req.session.user.username]
            );

            if (rows.length === 0) {
                return req.session.destroy(() => {
                    res.json({ loggedIn: false });
                });
            }

            req.session.user.primary_group = rows[0].primary_group;
            res.json({ loggedIn: true, user: req.session.user });

        } catch (dbError) {
            console.error('[Server] Error re-fetching user group:', dbError);
            res.status(500).json({ error: 'Failed to verify user status.' });
        }
    } else {
        res.json({ loggedIn: false });
    }
});

app.get('/api/all-staff', isAdmin, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const staffRanks = ['mod', 'srmod'];
        const placeholders = staffRanks.map(() => '?').join(',');
        const query = `
            SELECT 
                lp.username, 
                lp.primary_group, 
                lp.uuid,
                lgp.permission AS suffix_permission
            FROM luckperms_players AS lp
            LEFT JOIN luckperms_group_permissions AS lgp 
                ON lp.primary_group = lgp.name 
                AND lgp.permission LIKE 'suffix.%'
            WHERE lp.primary_group IN (${placeholders})
        `;
        const [rows] = await dbPool.execute(query, staffRanks);
        const staffWithColors = rows.map(staff => {
            const { style } = staff.suffix_permission ? parseMinecraftColors(staff.suffix_permission) : { style: '' };
            return { ...staff, colorStyle: style };
        });
        res.json(staffWithColors);
    } catch (dbError) {
        console.error('Database query error (all-staff):', dbError);
        res.status(500).json({ error: 'Failed to fetch staff list.' });
    }
});

app.post('/api/staff/warn', isAdmin, async (req, res) => {
    const { username, reason } = req.body;
    if (!username || !reason) {
        return res.status(400).json({ success: false, message: 'Username and reason are required.' });
    }
    try {
        await dbPool.execute(
            'INSERT INTO `staff_warnings` (username, reason, created_at) VALUES (?, ?, NOW())',
            [username, reason]
        );
        res.json({ success: true, message: 'Staff member has been warned.' });
    } catch (dbError) {
        res.status(500).json({ success: false, message: 'Failed to issue warning.' });
    }
});

app.post('/api/staff/promote', isAdmin, async (req, res) => {
    const { username, newRank } = req.body;
    const adminUsername = req.session.user.username;
    try {
        const [users] = await dbPool.execute(
            'SELECT username, primary_group FROM `luckperms_players` WHERE username IN (?, ?)',
            [[adminUsername, username]]
        );
        const adminUser = users.find(u => u.username === adminUsername);
        const targetUser = users.find(u => u.username === username);
        if (!adminUser || !targetUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const adminRankLevel = rankHierarchy[adminUser.primary_group] || 0;
        const targetRankLevel = rankHierarchy[targetUser.primary_group] || 0;
        const newRankLevel = rankHierarchy[newRank] || 0;
        if (adminRankLevel > targetRankLevel && adminRankLevel >= newRankLevel) {
            await dbPool.execute(
                'UPDATE `luckperms_players` SET primary_group = ? WHERE username = ?',
                [newRank, username]
            );
            await sendSyncCommand();
            res.json({ success: true, message: `${username} has been promoted to ${newRank}.` });
        } else {
            res.status(403).json({ success: false, message: 'You do not have permission to perform this promotion.' });
        }
    } catch (dbError) {
        res.status(500).json({ success: false, message: 'Failed to promote staff.' });
    }
});

app.post('/api/staff/demote', isAdmin, async (req, res) => {
    const { username, newRank } = req.body;
    const adminUsername = req.session.user.username;
    try {
        const [users] = await dbPool.execute(
            'SELECT username, primary_group FROM `luckperms_players` WHERE username IN (?, ?)',
            [[adminUsername, username]]
        );
        const adminUser = users.find(u => u.username === adminUsername);
        const targetUser = users.find(u => u.username === username);
        if (!adminUser || !targetUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const adminRankLevel = rankHierarchy[adminUser.primary_group] || 0;
        const targetRankLevel = rankHierarchy[targetUser.primary_group] || 0;
        if (adminRankLevel > targetRankLevel) {
            await dbPool.execute(
                'UPDATE `luckperms_players` SET primary_group = ? WHERE username = ?',
                [newRank, username]
            );
            await sendSyncCommand();
            res.json({ success: true, message: `${username} has been demoted to ${newRank}.` });
        } else {
            res.status(403).json({ success: false, message: 'You do not have permission to perform this demotion.' });
        }
    } catch (dbError) {
        res.status(500).json({ success: false, message: 'Failed to demote staff.' });
    }
});

app.post('/api/staff/setrank', isAdmin, async (req, res) => {
    const { username, newRank } = req.body;
    const assignableRanks = ['mod', 'srmod', 'admin', 'headadmin', 'manager'];
    if (!username || !assignableRanks.includes(newRank)) {
        return res.status(400).json({ success: false, message: 'Invalid username or rank provided.' });
    }
    try {
        const [result] = await dbPool.execute(
            'UPDATE `luckperms_players` SET primary_group = ? WHERE username = ?',
            [newRank, username]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: `Player '${username}' not found in LuckPerms.` });
        }
        await sendSyncCommand();
        res.json({ success: true, message: `${username}'s rank has been set to ${newRank}.` });
    } catch (dbError) {
        console.error('Database query error (set rank):', dbError);
        res.status(500).json({ success: false, message: 'Failed to set player rank.' });
    }
});

app.get('/api/pending-words', isSeniorStaff, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const [rows] = await dbPool.execute(
            'SELECT id, word, created_at FROM `pending_words` ORDER BY id DESC'
        );
        res.json(rows);
    } catch (dbError) {
        res.status(500).json({ error: 'Failed to fetch pending words.' });
    }
});

app.post('/api/save-words', isSeniorStaff, async (req, res) => {
    const { wordsToSave, wordsToDelete } = req.body;
    const added_by = req.session.user.username;
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        if (wordsToSave && wordsToSave.length > 0) {
            const insertPromises = wordsToSave.map(word => {
                const finalReason = word.note ? `${word.reason} | ${word.note}` : word.reason;
                const is_banned = word.reason !== "Allowed";
                return connection.execute(
                    'INSERT INTO `words` (word, added_by, reason, is_banned, last_edited) VALUES (?, ?, ?, ?, NOW())',
                    [word.word, added_by, finalReason, is_banned]
                );
            });
            await Promise.all(insertPromises);
        }
        const allIdsToDelete = [
            ...(wordsToSave || []).map(w => w.id),
            ...(wordsToDelete || [])
        ];
        if (allIdsToDelete.length > 0) {
            await connection.query(
                'DELETE FROM `pending_words` WHERE id IN (?)',
                [allIdsToDelete]
            );
        }
        await connection.commit();
        res.json({ success: true, message: 'Words saved successfully!' });
    } catch (error) {
        await connection.rollback();
        console.error('Error saving words:', error);
        res.status(500).json({ success: false, message: 'An error occurred.' });
    } finally {
        connection.release();
    }
});

app.get('/api/all-words', isSeniorStaff, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const [rows] = await dbPool.execute(`
            SELECT 
                w.id, w.word, w.added_by, w.reason, w.last_edited,
                lp.uuid AS added_by_uuid,
                lgp.permission AS suffix_permission
            FROM \`words\` AS w
            LEFT JOIN \`luckperms_players\` AS lp ON w.added_by = lp.username
            LEFT JOIN \`luckperms_group_permissions\` AS lgp ON lp.primary_group = lgp.name AND lgp.permission LIKE 'suffix.%'
            ORDER BY w.id DESC
        `);
        const wordsWithColors = rows.map(word => {
            const { style } = word.suffix_permission ? parseMinecraftColors(word.suffix_permission) : { style: '' };
            return { ...word, added_by_color_style: style };
        });
        res.json(wordsWithColors);
    } catch (dbError) {
        console.error('Database query error (all-words):', dbError);
        res.status(500).json({ error: 'Failed to fetch words.' });
    }
});

app.get('/api/my-stats', isAuthenticated, async (req, res) => {
    try {
        const username = req.session.user.username;
        res.setHeader('Cache-Control', 'no-store');
        const sql = `
            SELECT
                lp.username, lp.primary_group, lp.uuid,
                db.playtime,
                db.banCounts,
                db.muteCounts,
                pvp.points, pvp.kills, pvp.deaths, pvp.shards
            FROM luckperms_players AS lp
            LEFT JOIN deepbungee AS db ON lp.uuid = db.uuid
            LEFT JOIN pvp_nullping AS pvp ON lp.uuid = pvp.uuid
            WHERE lp.username = ?
        `;
        const [rows] = await dbPool.execute(sql, [username]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Player stats not found' });
        }
        res.json(rows[0]);
    } catch (dbError) {
        console.error('Database query error (my-stats):', dbError);
        res.status(500).json({ error: 'Failed to fetch your stats.' });
    }
});

app.post('/api/check-word', isAuthenticated, async (req, res) => {
    try {
        const { word } = req.body;
        const checked_by = req.session.user.username;
        if (!word) {
            return res.status(400).json({ error: 'Word is required.' });
        }
        const [rows] = await dbPool.execute(
            'SELECT reason, is_banned FROM `words` WHERE word = ?',
            [word]
        );
        if (rows.length > 0) {
            if (rows[0].is_banned) {
                return res.json({ found: true, allowed: false, reason: rows[0].reason });
            } else {
                return res.json({ found: true, allowed: true, message: `Word '${word}' is allowed.` });
            }
        }
        await dbPool.execute(
            'INSERT INTO `pending_words` (word, checked_by, created_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE word=word',
            [word, checked_by]
        );
        res.json({ found: false, message: `Word '${word}' submitted for review.` });
    } catch (dbError) {
        console.error('Database query error (check-word):', dbError);
        res.status(500).json({ error: 'Failed to process word.' });
    }
});

app.get('/api/my-warnings', isAuthenticated, async (req, res) => {
    try {
        const username = req.session.user.username;
        res.setHeader('Cache-Control', 'no-store');
        const [rows] = await dbPool.execute(
            'SELECT reason, created_at FROM `staff_warnings` WHERE username = ? ORDER BY id DESC',
            [username]
        );
        res.json(rows);
    } catch (dbError) {
        console.error('Database query error (my-warnings):', dbError);
        res.status(500).json({ error: 'Failed to fetch your warnings.' });
    }
});

app.get('/api/my-bans', isStaff, async (req, res) => {
    try {
        const adminUsername = req.session.user.username;
        res.setHeader('Cache-Control', 'no-store');
        const sql = `
            SELECT 
                dp.banid, dp.ign, dp.banReason, dp.banDuration, dp.banExpiresAt,
                lp.primary_group,
                lgp.permission AS suffix_permission
            FROM deep_punishments AS dp
            LEFT JOIN luckperms_players AS lp ON dp.ign = lp.username
            LEFT JOIN luckperms_group_permissions AS lgp ON lp.primary_group = lgp.name AND lgp.permission LIKE 'suffix.%'
            WHERE dp.banBy = ?
            ORDER BY dp.banid DESC
        `;
        const [rows] = await dbPool.execute(sql, [adminUsername]);
        const bansWithColors = rows.map(ban => {
            const { style } = ban.suffix_permission ? parseMinecraftColors(ban.suffix_permission) : { style: '' };
            return { ...ban, colorStyle: style };
        });
        res.json(bansWithColors);
    } catch (dbError) {
        console.error('Database query error (my-bans):', dbError);
        res.status(500).json({ error: 'Failed to fetch your bans.' });
    }
});

app.get('/api/top-bans', isStaff, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const staffRanks = ['mod', 'srmod', 'admin', 'headadmin', 'manager', 'owner'];
        const placeholders = staffRanks.map(() => '?').join(',');
        const sql = `
            SELECT 
                db.ign,
                db.banCounts,
                lp.uuid,
                lgp.permission AS suffix_permission
            FROM deepbungee AS db
            JOIN luckperms_players AS lp ON db.ign = lp.username
            LEFT JOIN luckperms_group_permissions AS lgp ON lp.primary_group = lgp.name AND lgp.permission LIKE 'suffix.%'
            WHERE lp.primary_group IN (${placeholders}) AND db.banCounts > 0
            ORDER BY db.banCounts DESC
        `;
        const [rows] = await dbPool.execute(sql, staffRanks);
        const staffWithColors = rows.map(staff => {
            const { style } = staff.suffix_permission ? parseMinecraftColors(staff.suffix_permission) : { style: '' };
            return { ...staff, colorStyle: style };
        });
        res.json(staffWithColors);
    } catch (dbError) {
        console.error('Database query error (top-bans):', dbError);
        res.status(500).json({ error: 'Failed to fetch top bans.' });
    }
});

app.get('/api/appeals', isSeniorStaff, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const sql = `
            SELECT 
                a.id, a.username, a.punishment_type, a.reason, a.created_at, a.status, a.handled_by,
                lp.uuid,
                lgp.permission AS suffix_permission
            FROM appeals AS a
            LEFT JOIN luckperms_players AS lp ON a.username = lp.username
            LEFT JOIN luckperms_group_permissions AS lgp ON lp.primary_group = lgp.name AND lgp.permission LIKE 'suffix.%'
            WHERE a.status = 'pending'
            ORDER BY a.id DESC
        `;
        const [rows] = await dbPool.execute(sql);
        const appealsWithColor = rows.map(appeal => {
            const { style } = appeal.suffix_permission ? parseMinecraftColors(appeal.suffix_permission) : { style: '' };
            return { ...appeal, colorStyle: style };
        });
        res.json(appealsWithColor);
    } catch (dbError) {
        console.error('Database query error (appeals):', dbError);
        res.status(500).json({ error: 'Failed to fetch appeals.' });
    }
});

app.get('/api/reports-history', isSeniorStaff, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const sql = `
            SELECT 
                rh.*,
                reporter_lp.uuid AS reporter_uuid,
                reporter_lgp.permission AS reporter_suffix,
                reported_lp.uuid AS reported_uuid,
                reported_lgp.permission AS reported_suffix,
                handler_lp.uuid AS handler_uuid,
                handler_lgp.permission AS handler_suffix
            FROM reports_history AS rh
            LEFT JOIN luckperms_players AS reporter_lp ON rh.reporter_username = reporter_lp.username
            LEFT JOIN luckperms_group_permissions AS reporter_lgp ON reporter_lp.primary_group = reporter_lgp.name AND reporter_lgp.permission LIKE 'suffix.%'
            LEFT JOIN luckperms_players AS reported_lp ON rh.reported_username = reported_lp.username
            LEFT JOIN luckperms_group_permissions AS reported_lgp ON reported_lp.primary_group = reported_lgp.name AND reported_lgp.permission LIKE 'suffix.%'
            LEFT JOIN luckperms_players AS handler_lp ON rh.handled_by = handler_lp.username
            LEFT JOIN luckperms_group_permissions AS handler_lgp ON handler_lp.primary_group = handler_lgp.name AND handler_lgp.permission LIKE 'suffix.%'
            ORDER BY rh.id DESC
        `;
        const [rows] = await dbPool.execute(sql);
        const historyWithColors = rows.map(row => {
            const { style: reporterStyle } = row.reporter_suffix ? parseMinecraftColors(row.reporter_suffix) : { style: '' };
            const { style: reportedStyle } = row.reported_suffix ? parseMinecraftColors(row.reported_suffix) : { style: '' };
            const { style: handlerStyle } = row.handler_suffix ? parseMinecraftColors(row.handler_suffix) : { style: '' };
            return { ...row, reporterStyle, reportedStyle, handlerStyle };
        });
        res.json(historyWithColors);
    } catch (dbError) {
        console.error('Database query error (reports-history):', dbError);
        res.status(500).json({ error: 'Failed to fetch reports history.' });
    }
});

app.get('/api/report/:id', isSeniorStaff, async (req, res) => {
    try {
        const reportId = req.params.id;
        const sql = `
            SELECT 
                r.*,
                reporter_lp.primary_group AS reporter_group,
                reporter_lgp.permission AS reporter_suffix,
                reported_lp.primary_group AS reported_group,
                reported_lgp.permission AS reported_suffix
            FROM reports AS r
            LEFT JOIN luckperms_players AS reporter_lp ON r.reporter_username = reporter_lp.username
            LEFT JOIN luckperms_group_permissions AS reporter_lgp ON reporter_lp.primary_group = reporter_lgp.name AND reporter_lgp.permission LIKE 'suffix.%'
            LEFT JOIN luckperms_players AS reported_lp ON r.reported_username = reported_lp.username
            LEFT JOIN luckperms_group_permissions AS reported_lgp ON reported_lp.primary_group = reported_lgp.name AND reported_lgp.permission LIKE 'suffix.%'
            WHERE r.id = ?
        `;
        const [rows] = await dbPool.execute(sql, [reportId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Report not found.' });
        }
        const report = rows[0];
        const { style: reporterStyle } = report.reporter_suffix ? parseMinecraftColors(report.reporter_suffix) : { style: '' };
        const { style: reportedStyle } = report.reported_suffix ? parseMinecraftColors(report.reported_suffix) : { style: '' };
        res.json({ ...report, reporterStyle, reportedStyle });
    } catch (dbError) {
        res.status(500).json({ error: 'Failed to fetch report details.' });
    }
});

app.get('/api/admin-reports', isSeniorStaff, async (req, res) => {
    try {
        const sql = `
            SELECT 
                r.id, r.reporter_username, r.reported_username, r.report_type, r.evidence_link, r.status, r.claimed_by,
                reporter_lp.primary_group AS reporter_group,
                reporter_lgp.permission AS reporter_suffix,
                reported_lp.primary_group AS reported_group,
                reported_lgp.permission AS reported_suffix
            FROM reports AS r
            LEFT JOIN luckperms_players AS reporter_lp ON r.reporter_username = reporter_lp.username
            LEFT JOIN luckperms_group_permissions AS reporter_lgp ON reporter_lp.primary_group = reporter_lgp.name AND reporter_lgp.permission LIKE 'suffix.%'
            LEFT JOIN luckperms_players AS reported_lp ON r.reported_username = reported_lp.username
            LEFT JOIN luckperms_group_permissions AS reported_lgp ON reported_lp.primary_group = reported_lgp.name AND reported_lgp.permission LIKE 'suffix.%'
            WHERE r.status IN ('pending', 'claimed') 
            ORDER BY r.id DESC
        `;
        const [rows] = await dbPool.execute(sql);
        const reportsWithColors = rows.map(report => {
            const { style: reporterStyle } = report.reporter_suffix ? parseMinecraftColors(report.reporter_suffix) : { style: '' };
            const { style: reportedStyle } = report.reported_suffix ? parseMinecraftColors(report.reported_suffix) : { style: '' };
            return { ...report, reporterStyle, reportedStyle };
        });
        res.json(reportsWithColors);
    } catch (dbError) {
        res.status(500).json({ error: 'Failed to fetch reports.' });
    }
});

app.post('/api/reports/claim/:id', isSeniorStaff, async (req, res) => {
    try {
        const reportId = req.params.id;
        const adminUsername = req.session.user.username;
        await dbPool.execute(
            "UPDATE `reports` SET status = 'claimed', claimed_by = ? WHERE id = ? AND status = 'pending'",
            [adminUsername, reportId]
        );
        res.json({ success: true });
    } catch (dbError) {
        res.status(500).json({ success: false, message: 'Failed to claim report.' });
    }
});

app.post('/api/submit-report', isAuthenticated, async (req, res) => {
    const { reported_username, report_type, evidence_link, extra_notes } = req.body;
    const reporter_username = req.session.user.username;
    if (!reported_username || !report_type || !evidence_link) {
        return res.status(400).json({ success: false, message: 'Please fill out all required fields.' });
    }
    try {
        await dbPool.execute(
            'INSERT INTO `reports` (reporter_username, reported_username, report_type, evidence_link, extra_notes) VALUES (?, ?, ?, ?, ?)',
            [reporter_username, reported_username, report_type, evidence_link, extra_notes]
        );
        res.json({ success: true, message: 'Your report has been submitted successfully. Thank you!' });
    } catch (dbError) {
        console.error("Error submitting report:", dbError);
        res.status(500).json({ success: false, message: 'Failed to submit report.' });
    }
});

app.get('/api/my-punishment', isAuthenticated, async (req, res) => {
    try {
        const userUUID = req.session.user.uuid;
        res.setHeader('Cache-Control', 'no-store');
        const [punishmentRows] = await dbPool.execute(
            `SELECT banid, banReason, banDuration, banExpiresAt, muteid, muteReason, muteDuration, muteExpiresAt 
             FROM \`deep_punishments\` 
             WHERE uuid = ? AND (
                 (banExpiresAt = 0 OR banExpiresAt > UNIX_TIMESTAMP() * 1000) OR
                 (muteExpiresAt = 0 OR muteExpiresAt > UNIX_TIMESTAMP() * 1000)
             )`, [userUUID]
        );
        const activeBan = punishmentRows.find(p => p.banid);
        const activeMute = punishmentRows.find(p => p.muteid);
        let appealData = null;
        if (activeBan || activeMute) {
            const punishment_id = activeBan ? activeBan.banid : activeMute.muteid;
            const punishment_type = activeBan ? 'ban' : 'mute';
            const [appealRows] = await dbPool.execute(
                'SELECT status, response FROM `appeals` WHERE punishment_id = ? AND punishment_type = ?',
                [punishment_id, punishment_type]
            );
            if (appealRows.length > 0) {
                appealData = appealRows[0];
            }
        }
        res.json({
            hasBan: !!activeBan,
            banDetails: activeBan,
            hasMute: !!activeMute,
            muteDetails: activeMute,
            appeal: appealData
        });
    } catch (dbError) {
        console.error('Database query error (my-punishment):', dbError);
        res.status(500).json({ error: 'Failed to fetch punishment status.' });
    }
});

app.get('/api/mod-apply/status', isAuthenticated, async (req, res) => {
    try {
        const username = req.session.user.username;
        const userUUID = req.session.user.uuid;
        res.setHeader('Cache-Control', 'no-store');
        const [configRows] = await dbPool.execute('SELECT value FROM server_config WHERE config_key = "applications_open"');
        const applicationsOpen = configRows.length > 0 ? configRows[0].value === 'true' : false;
        if (!applicationsOpen) {
            return res.json({
                canApply: false,
                reason: 'Applications are currently closed. Please check back later when applications are reopened.',
                playerStats: { 
                    playtime: 0, 
                    recentPunishments: 0,
                    discordLinked: false,
                    applicationsOpen: false
                }
            });
        }
        const [playerRows] = await dbPool.execute(
            `SELECT db.playtime, lp.primary_group, dl.discord_username
             FROM deepbungee AS db 
             LEFT JOIN luckperms_players AS lp ON db.uuid = lp.uuid 
             LEFT JOIN discord_links AS dl ON lp.uuid = dl.minecraft_uuid
             WHERE db.uuid = ?`,
            [userUUID]
        );
        if (playerRows.length === 0) {
            return res.status(404).json({ error: 'Player data not found' });
        }
        const playerData = playerRows[0];
        if (!playerData.discord_username) {
            return res.json({
                canApply: false,
                reason: 'You must link your Discord account before applying for moderator. Please use the /discord link command in-game.',
                playerStats: { 
                    playtime: playerData.playtime, 
                    recentPunishments: 0,
                    discordLinked: false,
                    applicationsOpen: true
                }
            });
        }
        const staffRanks = ['mod', 'srmod', 'admin', 'headadmin', 'manager', 'owner'];
        if (staffRanks.includes(playerData.primary_group)) {
            return res.json({
                canApply: false,
                reason: 'You are already a staff member.',
                playerStats: { 
                    playtime: playerData.playtime, 
                    recentPunishments: 0,
                    discordLinked: true,
                    discordUsername: playerData.discord_username,
                    applicationsOpen: true
                }
            });
        }
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const [punishmentRows] = await dbPool.execute(
            `SELECT COUNT(*) as count FROM deep_punishments 
             WHERE uuid = ? AND (
                 (banExpiresAt > ? AND banExpiresAt > 0) OR 
                 (muteExpiresAt > ? AND muteExpiresAt > 0)
             )`,
            [userUUID, thirtyDaysAgo, thirtyDaysAgo]
        );
        const recentPunishments = punishmentRows[0].count;
        const [currentAppRows] = await dbPool.execute(
            'SELECT * FROM mod_applications WHERE username = ? AND status = "pending" ORDER BY id DESC LIMIT 1',
            [username]
        );
        const [previousAppRows] = await dbPool.execute(
            'SELECT id, status, created_at, response FROM mod_applications WHERE username = ? AND status != "pending" ORDER BY id DESC LIMIT 5',
            [username]
        );
        const hasRecentDenial = previousAppRows.some(app => {
            if (app.status === 'denied') {
                const daysSince = Math.floor((Date.now() - new Date(app.created_at).getTime()) / (1000 * 60 * 60 * 24));
                return daysSince < 30;
            }
            return false;
        });
        const canApply = currentAppRows.length === 0 && !hasRecentDenial;
        res.json({
            canApply,
            playerStats: {
                playtime: playerData.playtime,
                recentPunishments,
                discordLinked: true,
                discordUsername: playerData.discord_username
            },
            currentApplication: currentAppRows[0] || null,
            previousApplications: previousAppRows,
            reason: hasRecentDenial ? 'You must wait 30 days after a denied application before applying again.' : null
        });
    } catch (dbError) {
        console.error('Database query error (mod-apply status):', dbError);
        res.status(500).json({ error: 'Failed to check application status.' });
    }
});

app.post('/api/mod-apply/submit', isAuthenticated, async (req, res) => {
    try {
        const username = req.session.user.username;
        const userUUID = req.session.user.uuid;
        const {
            real_name,
            age,
            timezone,
            experience,
            motivation,
            availability,
            scenario1,
            scenario2
        } = req.body;
        if (!real_name || !age || !timezone || !experience || !motivation || !availability || !scenario1 || !scenario2) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }
        if (real_name.length > 50 || 
            experience.length > 500 || motivation.length > 500 || 
            availability.length > 300 || scenario1.length > 400 || scenario2.length > 400) {
            return res.status(400).json({ success: false, message: 'One or more fields exceed maximum length.' });
        }
        const [existingRows] = await dbPool.execute(
            'SELECT id FROM mod_applications WHERE username = ? AND status = "pending"',
            [username]
        );
        if (existingRows.length > 0) {
            return res.status(400).json({ success: false, message: 'You already have a pending application.' });
        }
        const [categoryRows] = await dbPool.execute(
            'SELECT id FROM application_categories WHERE status = "open" ORDER BY id DESC LIMIT 1'
        );
        if (categoryRows.length === 0) {
            return res.status(400).json({ success: false, message: 'No open application categories available.' });
        }
        const applicationCategoryId = categoryRows[0].id;
        const [playerRows] = await dbPool.execute(
            `SELECT db.playtime, dl.discord_username 
             FROM deepbungee AS db 
             LEFT JOIN luckperms_players AS lp ON db.uuid = lp.uuid
             LEFT JOIN discord_links AS dl ON lp.uuid = dl.minecraft_uuid
             WHERE db.uuid = ?`,
            [userUUID]
        );
        if (playerRows.length === 0 || !playerRows[0].discord_username) {
            return res.status(400).json({ success: false, message: 'Discord account must be linked before applying.' });
        }
        const playerData = playerRows[0];
        if (playerData.playtime < 0) { // 50 hours
            return res.status(400).json({ success: false, message: 'You do not meet the playtime requirements.' });
        }
        const [result] = await dbPool.execute(
            `INSERT INTO mod_applications 
             (username, application_category_id, real_name, age, timezone, discord, experience, motivation, availability, scenario1, scenario2, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [username, applicationCategoryId, real_name, age, timezone, playerData.discord_username, experience, motivation, availability, scenario1, scenario2]
        );
        const newApplicationId = result.insertId;
        if (config.DISCORD_APPLICATION_WEBHOOK_URL && config.WEBSITE_URL) {
            const webhookPayload = {
                content: "@everyone",
                embeds: [{
                    title: "New Moderator Application",
                    description: `A new moderator application has been submitted by **${username}**.`,
                    color: 3447003, // Blue color
                    fields: [
                        { name: "Player", value: `[${username}](${config.WEBSITE_URL}/profile/${username})`, inline: true },
                        { name: "Age", value: age, inline: true },
                        { name: "Timezone", value: timezone, inline: true },
                        { name: "Discord", value: playerData.discord_username, inline: false },
                        { name: "View Application", value: `[Admin Panel](${config.WEBSITE_URL}/staff/applications/view/${newApplicationId})`, inline: false }
                    ],
                    footer: {
                        text: `Application ID: ${newApplicationId} | Category: ${applicationCategoryId}`
                    },
                    timestamp: new Date().toISOString()
                }]
            };
            try {
                await axios.post(config.DISCORD_APPLICATION_WEBHOOK_URL, webhookPayload);
                console.log('[Discord] Application notification sent successfully.');
            } catch (webhookError) {
                console.error('[Discord] Failed to send application notification:', webhookError.message);
            }
        }
        res.json({ success: true, message: 'Your application has been submitted successfully!' });
    } catch (dbError) {
        console.error('Database query error (mod-apply submit):', dbError);
        res.status(500).json({ success: false, message: 'Failed to submit application.' });
    }
});

app.get('/api/staff/application-categories', isSeniorStaff, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const sql = `
            SELECT 
                ac.id, ac.title, ac.status, ac.created_at, ac.created_by, ac.last_modified_at, ac.last_modified_by,
                creator_lp.uuid as created_by_uuid,
                creator_lgp.permission as created_by_suffix,
                modifier_lp.uuid as last_modified_by_uuid,
                modifier_lgp.permission as last_modified_by_suffix
            FROM application_categories AS ac
            LEFT JOIN luckperms_players AS creator_lp ON ac.created_by = creator_lp.username
            LEFT JOIN luckperms_group_permissions AS creator_lgp ON creator_lp.primary_group = creator_lgp.name AND creator_lgp.permission LIKE 'suffix.%'
            LEFT JOIN luckperms_players AS modifier_lp ON ac.last_modified_by = modifier_lp.username
            LEFT JOIN luckperms_group_permissions AS modifier_lgp ON modifier_lp.primary_group = modifier_lgp.name AND modifier_lgp.permission LIKE 'suffix.%'
            ORDER BY ac.id DESC
        `;
        const [rows] = await dbPool.execute(sql);
        const [configRows] = await dbPool.execute('SELECT value FROM server_config WHERE config_key = "applications_open"');
        const applicationsOpen = configRows.length > 0 ? configRows[0].value === 'true' : false;
        const categoriesWithColors = rows.map(category => {
            const { style: createdByColor } = category.created_by_suffix ? parseMinecraftColors(category.created_by_suffix) : { style: '' };
            const { style: modifiedByColor } = category.last_modified_by_suffix ? parseMinecraftColors(category.last_modified_by_suffix) : { style: '' };
            return { 
                ...category, 
                created_by_color: createdByColor,
                last_modified_by_color: modifiedByColor
            };
        });
        res.json({
            applications: categoriesWithColors,
            applicationsOpen
        });
    } catch (dbError) {
        console.error('Database query error (application categories):', dbError);
        res.status(500).json({ error: 'Failed to fetch application categories.' });
    }
});

app.post('/api/staff/application-categories/create', isSeniorStaff, async (req, res) => {
    try {
        const { title, description } = req.body;
        const createdBy = req.session.user.username;
        if (!title) {
            return res.status(400).json({ success: false, message: 'Title is required.' });
        }
        await dbPool.execute(
            'INSERT INTO application_categories (title, description, created_by, created_at) VALUES (?, ?, ?, NOW())',
            [title, description || null, createdBy]
        );
        res.json({ success: true, message: 'Application category created successfully!' });
    } catch (dbError) {
        console.error('Database query error (create application category):', dbError);
        res.status(500).json({ success: false, message: 'Failed to create application category.' });
    }
});

app.post('/api/staff/applications/toggle', isSeniorStaff, async (req, res) => {
    try {
        const modifiedBy = req.session.user.username;
        const [configRows] = await dbPool.execute('SELECT value FROM server_config WHERE config_key = "applications_open"');
        const currentStatus = configRows.length > 0 ? configRows[0].value === 'true' : false;
        const newStatus = !currentStatus;
        if (configRows.length > 0) {
            await dbPool.execute(
                'UPDATE server_config SET value = ?, last_modified_by = ?, last_modified_at = NOW() WHERE config_key = "applications_open"',
                [newStatus.toString(), modifiedBy]
            );
        } else {
            await dbPool.execute(
                'INSERT INTO server_config (config_key, value, last_modified_by, last_modified_at) VALUES ("applications_open", ?, ?, NOW())',
                [newStatus.toString(), modifiedBy]
            );
        }
        res.json({ 
            success: true, 
            message: `Applications have been ${newStatus ? 'opened' : 'closed'}.`,
            newStatus: newStatus
        });
    } catch (dbError) {
        console.error('Database query error (toggle applications):', dbError);
        res.status(500).json({ success: false, message: 'Failed to toggle application status.' });
    }
});

app.get('/api/staff/applications/:categoryId/submissions', isSeniorStaff, async (req, res) => {
    try {
        const categoryId = req.params.categoryId;
        res.setHeader('Cache-Control', 'no-store');
        const sql = `
            SELECT 
                ma.id, ma.username, ma.discord, ma.status, ma.created_at, ma.handled_by, ma.handled_at,
                lp.uuid,
                lgp.permission AS suffix_permission,
                db.playtime,
                handler_lp.uuid as handled_by_uuid,
                handler_lgp.permission as handled_by_suffix
            FROM mod_applications AS ma
            LEFT JOIN luckperms_players AS lp ON ma.username = lp.username
            LEFT JOIN luckperms_group_permissions AS lgp ON lp.primary_group = lgp.name AND lgp.permission LIKE 'suffix.%'
            LEFT JOIN deepbungee AS db ON lp.uuid = db.uuid
            LEFT JOIN luckperms_players AS handler_lp ON ma.handled_by = handler_lp.username
            LEFT JOIN luckperms_group_permissions AS handler_lgp ON handler_lp.primary_group = handler_lgp.name AND handler_lgp.permission LIKE 'suffix.%'
            WHERE ma.application_category_id = ?
            ORDER BY 
                CASE ma.status 
                    WHEN 'pending' THEN 1 
                    WHEN 'reviewing' THEN 2 
                    WHEN 'approved' THEN 3 
                    WHEN 'denied' THEN 4 
                END,
                ma.id DESC
        `;
        const [rows] = await dbPool.execute(sql, [categoryId]);
        const applicationsWithColors = rows.map(app => {
            const { style } = app.suffix_permission ? parseMinecraftColors(app.suffix_permission) : { style: '' };
            const { style: handlerColor } = app.handled_by_suffix ? parseMinecraftColors(app.handled_by_suffix) : { style: '' };
            return { 
                ...app, 
                colorStyle: style,
                handled_by_color: handlerColor
            };
        });
        res.json({ applications: applicationsWithColors });
    } catch (dbError) {
        console.error('Database query error (category applications):', dbError);
        res.status(500).json({ error: 'Failed to fetch applications for this category.' });
    }
});

app.get('/api/staff/applications/view/:id', isSeniorStaff, async (req, res) => {
    try {
        const applicationId = req.params.id;
        const sql = `
            SELECT 
                ma.*,
                lp.uuid,
                lgp.permission AS suffix_permission,
                db.playtime,
                handler_lp.uuid as handled_by_uuid,
                handler_lgp.permission as handled_by_suffix
            FROM mod_applications AS ma
            LEFT JOIN luckperms_players AS lp ON ma.username = lp.username
            LEFT JOIN luckperms_group_permissions AS lgp ON lp.primary_group = lgp.name AND lgp.permission LIKE 'suffix.%'
            LEFT JOIN deepbungee AS db ON lp.uuid = db.uuid
            LEFT JOIN luckperms_players AS handler_lp ON ma.handled_by = handler_lp.username
            LEFT JOIN luckperms_group_permissions AS handler_lgp ON handler_lp.primary_group = handler_lgp.name AND handler_lgp.permission LIKE 'suffix.%'
            WHERE ma.id = ?
        `;
        const [rows] = await dbPool.execute(sql, [applicationId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Application not found.' });
        }
        const application = rows[0];
        const { style } = application.suffix_permission ? parseMinecraftColors(application.suffix_permission) : { style: '' };
        const { style: handlerColor } = application.handled_by_suffix ? parseMinecraftColors(application.handled_by_suffix) : { style: '' };
        res.json({ 
            ...application, 
            colorStyle: style,
            handled_by_color: handlerColor
        });
    } catch (dbError) {
        console.error('Database query error (single application):', dbError);
        res.status(500).json({ error: 'Failed to fetch application details.' });
    }
});

app.post('/api/staff/applications/:id/handle', isSeniorStaff, async (req, res) => {
    try {
        const applicationId = req.params.id;
        const { action, response } = req.body;
        const handledBy = req.session.user.username;
        if (!action || !response) {
            return res.status(400).json({ success: false, message: 'Action and response are required.' });
        }
        if (!['approve', 'deny'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Invalid action.' });
        }
        const connection = await dbPool.getConnection();
        try {
            await connection.beginTransaction();
            const [appRows] = await connection.execute(
                'SELECT username FROM mod_applications WHERE id = ? AND status IN ("pending", "reviewing")',
                [applicationId]
            );
            if (appRows.length === 0) {
                throw new Error('Application not found or already handled.');
            }
            await connection.execute(
                'UPDATE mod_applications SET status = ?, response = ?, handled_by = ?, handled_at = NOW() WHERE id = ?',
                [action === 'approve' ? 'approved' : 'denied', response, handledBy, applicationId]
            );
            await connection.commit();
            let message = `Application has been ${action === 'approve' ? 'approved' : 'denied'}.`;
            if (action === 'approve') {
                message += ` Use the Discord bot command $sync roles ${applicationId} to give Discord roles to accepted players.`;
            }
            res.json({ 
                success: true, 
                message: message
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error handling application:', error);
        res.status(500).json({ success: false, message: 'Failed to handle application.' });
    }
});

app.post('/api/staff/applications/:id/claim', isSeniorStaff, async (req, res) => {
    try {
        const applicationId = req.params.id;
        const handledBy = req.session.user.username;
        const [result] = await dbPool.execute(
            'UPDATE mod_applications SET status = "reviewing", handled_by = ? WHERE id = ? AND status = "pending"',
            [handledBy, applicationId]
        );
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Application claimed successfully.' });
        } else {
            res.status(409).json({ success: false, message: 'This application has already been claimed.' });
        }
    } catch (dbError) {
        console.error('Database query error (claim application):', dbError);
        res.status(500).json({ success: false, message: 'Failed to claim application.' });
    }
});

app.get('/api/discord/sync-roles/:applicationId', async (req, res) => {
    try {
        const applicationId = req.params.applicationId;
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${config.DISCORD_BOT_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const sql = `
            SELECT 
                ma.id, ma.username, ma.application_category_id,
                dl.discord_id, dl.discord_username,
                lp.uuid, lp.primary_group
            FROM mod_applications AS ma
            LEFT JOIN luckperms_players AS lp ON ma.username = lp.username
            LEFT JOIN discord_links AS dl ON lp.uuid = dl.minecraft_uuid
            WHERE ma.application_category_id = ? 
            AND ma.status = 'approved' 
            AND ma.discord_synced = 0
            ORDER BY ma.id ASC
        `;
        const [rows] = await dbPool.execute(sql, [applicationId]);
        const playersToSync = rows.map(row => ({
            applicationId: row.id,
            username: row.username,
            discordId: row.discord_id,
            discordUsername: row.discord_username,
            isLinked: !!row.discord_id,
            currentRank: row.primary_group
        }));
        res.json({
            success: true,
            applicationCategoryId: applicationId,
            players: playersToSync
        });
    } catch (dbError) {
        console.error('Database query error (discord sync roles):', dbError);
        res.status(500).json({ error: 'Failed to fetch sync data.' });
    }
});

app.post('/api/discord/mark-synced', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const { applicationIds, syncedBy } = req.body;
        if (!authHeader || authHeader !== `Bearer ${config.DISCORD_BOT_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
            return res.status(400).json({ error: 'Application IDs are required' });
        }
        const validIds = applicationIds.filter(id => typeof id === 'number' || /^\d+$/.test(id));
        if (validIds.length === 0) {
            return res.status(400).json({ error: 'Invalid application IDs.' });
        }
        const placeholders = validIds.map(() => '?').join(',');
        const params = [syncedBy, ...validIds];
        console.log('Marking as synced:', params);
        const [result] = await dbPool.execute(
            `UPDATE mod_applications 
             SET discord_synced = 1, synced_by = ?, synced_at = NOW() 
             WHERE id IN (${placeholders})`,
            params
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'No applications updated.' });
        }
        res.json({ success: true, message: 'Applications marked as synced.' });
    } catch (dbError) {
        console.error('Database query error (mark synced):', dbError);
        res.status(500).json({ error: 'Failed to mark applications as synced.', details: dbError.message });
    }
});

app.post('/api/discord/stop-sync/:applicationId', async (req, res) => {
    try {
        const applicationId = req.params.applicationId;
        const authHeader = req.headers.authorization;
        const { stoppedBy } = req.body;
        if (!authHeader || authHeader !== `Bearer ${config.DISCORD_BOT_SECRET}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        await dbPool.execute(
            `UPDATE mod_applications 
             SET discord_synced = 1, synced_by = ?, synced_at = NOW() 
             WHERE application_category_id = ? AND status = 'approved' AND discord_synced = 0`,
            [stoppedBy, applicationId]
        );
        res.json({ success: true, message: `Syncing stopped for application category ${applicationId}.` });
    } catch (dbError) {
        console.error('Database query error (stop sync):', dbError);
        res.status(500).json({ error: 'Failed to stop syncing.' });
    }
});

app.post('/api/appeal/update-response/:id', isSeniorStaff, async (req, res) => {
    const appealId = req.params.id;
    const { response } = req.body;
    const handled_by = req.session.user.username;
    if (!response) {
        return res.status(400).json({ success: false, message: 'A response is required.' });
    }
    try {
        await dbPool.execute(
            "UPDATE `appeals` SET response = ?, handled_by = ? WHERE id = ?",
            [response, handled_by, appealId]
        );
        res.json({ success: true, message: 'Response has been updated.' });
    } catch (dbError) {
        res.status(500).json({ success: false, message: 'Failed to update appeal.' });
    }
});

app.post('/api/appeal/claim/:id', isSeniorStaff, async (req, res) => {
    const appealId = req.params.id;
    const handled_by = req.session.user.username;
    try {
        const [result] = await dbPool.execute(
            "UPDATE `appeals` SET status = 'claimed', handled_by = ? WHERE id = ? AND status = 'pending'",
            [handled_by, appealId]
        );
        if (result.affectedRows > 0) {
            res.json({ success: true, message: 'Appeal claimed successfully.' });
        } else {
            res.status(409).json({ success: false, message: 'This appeal has already been claimed.' });
        }
    } catch (dbError) {
        console.error('Database query error (claim appeal):', dbError);
        res.status(500).json({ success: false, message: 'Failed to claim appeal.' });
    }
});

app.get('/api/appeal/:id', isSeniorStaff, async (req, res) => {
    try {
        const appealId = req.params.id;
        const sql = `
            SELECT 
                a.*,
                lp.uuid,
                lgp.permission AS suffix_permission,
                dp.banBy, dp.banReason, dp.muteBy, dp.muteReason
            FROM appeals AS a
            LEFT JOIN luckperms_players AS lp ON a.username = lp.username
            LEFT JOIN luckperms_group_permissions AS lgp ON lp.primary_group = lgp.name AND lgp.permission LIKE 'suffix.%'
            LEFT JOIN deep_punishments AS dp ON a.punishment_id = IF(a.punishment_type = 'ban', dp.banid, dp.muteid)
            WHERE a.id = ?
        `;
        const [rows] = await dbPool.execute(sql, [appealId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Appeal not found.' });
        }
        const appeal = rows[0];
        const { style } = appeal.suffix_permission ? parseMinecraftColors(appeal.suffix_permission) : { style: '' };
        res.json({ ...appeal, colorStyle: style });
    } catch (dbError) {
        res.status(500).json({ error: 'Failed to fetch appeal details.' });
    }
});

app.post('/api/appeal/handle/:id', isSeniorStaff, async (req, res) => {
    const appealId = req.params.id;
    const { outcome, punishment_id, punishment_type } = req.body;
    const handled_by = req.session.user.username;
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute(
            "UPDATE `appeals` SET status = ?, handled_by = ? WHERE id = ?",
            [outcome, handled_by, appealId]
        );
        if (outcome === 'Accepted') {
            if (punishment_type === 'ban') {
                await connection.execute("UPDATE `deep_punishments` SET banExpiresAt = 1 WHERE banid = ?", [punishment_id]);
            } else if (punishment_type === 'mute') {
                await connection.execute("UPDATE `deep_punishments` SET muteExpiresAt = 1 WHERE muteid = ?", [punishment_id]);
            }
        }
        await connection.commit();
        res.json({ success: true, message: `Appeal has been ${outcome.toLowerCase()}.` });
    } catch (error) {
        await connection.rollback();
        console.error('Error handling appeal:', error);
        res.status(500).json({ success: false, message: 'An error occurred.' });
    } finally {
        connection.release();
    }
});

app.post('/api/submit-appeal', isAuthenticated, async (req, res) => {
    const { punishment_id, punishment_type, reason } = req.body;
    const username = req.session.user.username;
    if (!reason) {
        return res.status(400).json({ success: false, message: 'Appeal reason is required.' });
    }
    try {
        const [result] = await dbPool.execute(
            'INSERT INTO `appeals` (username, punishment_id, punishment_type, reason, created_at) VALUES (?, ?, ?, ?, NOW())',
            [username, punishment_id, punishment_type, reason]
        );
        const newAppealId = result.insertId;
        if (config.DISCORD_APPEAL_WEBHOOK_URL && config.WEBSITE_URL) {
            const appealLink = `${config.WEBSITE_URL}/staff/appeals/${newAppealId}`;
            const webhookPayload = {
                content: "@everyone",
                embeds: [{
                    title: "New Punishment Appeal Submitted",
                    description: `An appeal for a **${punishment_type}** has been submitted by **${username}**.`,
                    color: 16762880,
                    fields: [
                        { name: "Player", value: `[${username}](${config.WEBSITE_URL}/profile/${username})`, inline: true },
                        { name: "View Appeal", value: `[Click Here to View](${appealLink})`, inline: true }
                    ],
                    footer: {
                        text: `Appeal ID: ${newAppealId}`
                    },
                    timestamp: new Date().toISOString()
                }]
            };
            try {
                await axios.post(config.DISCORD_APPEAL_WEBHOOK_URL, webhookPayload);
                console.log('[Discord] Appeal notification sent successfully.');
            } catch (webhookError) {
                console.error('[Discord] Failed to send appeal notification:', webhookError.message);
            }
        }
        res.json({ success: true, message: 'Your appeal has been submitted successfully.' });
    } catch (dbError) {
        console.error("Error submitting appeal:", dbError);
        res.status(500).json({ success: false, message: 'Failed to submit appeal.' });
    }
});

app.get('/api/active-mutes', isSeniorStaff, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const [rows] = await dbPool.execute(
            `SELECT muteid, ign, muteBy, muteReason, muteDuration, muteExpiresAt 
             FROM \`deep_punishments\` 
             WHERE (muteExpiresAt = 0 OR muteExpiresAt > UNIX_TIMESTAMP() * 1000) AND muteid IS NOT NULL
             ORDER BY muteid DESC`
        );
        res.json(rows);
    } catch (dbError) {
        console.error('Database query error (active-mutes):', dbError);
        res.status(500).json({ error: 'Failed to fetch active mutes.' });
    }
});

app.get('/api/active-bans', isSeniorStaff, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const [rows] = await dbPool.execute(
            `SELECT banid, ign, banBy, banReason, banDuration, banExpiresAt 
             FROM \`deep_punishments\` 
             WHERE banExpiresAt = 0 OR banExpiresAt > UNIX_TIMESTAMP() * 1000 
             ORDER BY banid DESC`
        );
        res.json(rows);
    } catch (dbError) {
        console.error('Database query error (active-bans):', dbError);
        res.status(500).json({ error: 'Failed to fetch active bans.' });
    }
});

app.get('/api/staff', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const rankOrder = ['owner', 'manager', 'headadmin', 'admin', 'srmod', 'seniormod', 'mod'];
        const fieldPlaceholders = rankOrder.map(() => '?').join(',');
        const sqlQuery = `
            SELECT
                au.username,
                lp.primary_group,
                lp.uuid,
                db.playtime,
                au.is_logged_in,
                lgp.permission AS suffix_permission
            FROM
                luckperms_players AS lp
            LEFT JOIN
                deepbungee AS db ON lp.uuid = db.uuid
            LEFT JOIN
                auth_users AS au ON lp.uuid = au.uuid
            LEFT JOIN
                luckperms_group_permissions AS lgp ON lp.primary_group = lgp.name AND lgp.permission LIKE 'suffix.%'
            WHERE
                lp.primary_group IN (${fieldPlaceholders})
            ORDER BY
                FIELD(lp.primary_group, ${fieldPlaceholders})
        `;
        const sqlParams = [...rankOrder, ...rankOrder];
        const [rows] = await dbPool.execute(sqlQuery, sqlParams);
        const playersWithColors = rows.map(player => {
            const { style, hexColor } = player.suffix_permission 
                ? parseMinecraftColors(player.suffix_permission) 
                : { style: '', hexColor: '#00AAAA' };
            return { ...player, colorStyle: style, rankColor: hexColor || '#00AAAA' };
        });
        res.json(playersWithColors);
    } catch (dbError) {
        console.error('Database query error (staff):', dbError);
        res.status(500).json({ error: 'Failed to fetch staff list.' });
    }
});


app.get('/api/guilds', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const sql = `
            SELECT 
                g.id, 
                g.name, 
                g.tag,
                g.tag_color,
                g.created_at,
                au.username AS owner_name,
                lgp.permission AS owner_suffix_permission,
                (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) AS member_count
            FROM 
                guilds AS g
            LEFT JOIN 
                luckperms_players AS lp ON g.owner_uuid = lp.uuid
            LEFT JOIN
                auth_users AS au ON g.owner_uuid = au.uuid
            LEFT JOIN
                luckperms_group_permissions AS lgp ON lp.primary_group = lgp.name AND lgp.permission LIKE 'suffix.%'
            ORDER BY 
                member_count DESC
        `;
        const [rows] = await dbPool.execute(sql);
        const guildsWithData = rows.map(guild => {
            const { style: ownerColorStyle } = guild.owner_suffix_permission 
                ? parseMinecraftColors(guild.owner_suffix_permission) 
                : { style: '' };
            const { style: tagColorStyle } = guild.tag_color 
                ? parseMinecraftColors(guild.tag_color) 
                : { style: '' };
            return { ...guild, ownerColorStyle, tagColorStyle };
        });
        res.json(guildsWithData);
    } catch (dbError) {
        console.error('Database query error (guilds):', dbError);
        res.status(500).json({ error: 'Failed to fetch guilds.' });
    }
});

app.get('/api/guild/:guildName', async (req, res) => {
    try {
        const { guildName } = req.params;
        res.setHeader('Cache-Control', 'no-store');
        const [guildRows] = await dbPool.execute(
            `SELECT g.id, g.name, g.tag, g.created_at, 
            (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) AS member_count
            FROM guilds AS g WHERE g.name = ?`,
            [guildName]
        );
        if (guildRows.length === 0) {
            return res.status(404).json({ error: 'Guild not found.' });
        }
        const guildInfo = guildRows[0];
        const [memberRows] = await dbPool.execute(
            `SELECT 
                gm.player_uuid AS uuid, gm.joined_at,
                au.username,
                lgp.permission AS suffix_permission,
                au.last_login,
                gr.name AS guild_rank_name,
                gr.priority 
            FROM guild_members AS gm
            LEFT JOIN guild_ranks AS gr ON gm.rank_id = gr.id
            LEFT JOIN luckperms_players AS lp ON gm.player_uuid = lp.uuid
            LEFT JOIN auth_users AS au ON gm.player_uuid = au.uuid
            LEFT JOIN luckperms_group_permissions AS lgp ON lp.primary_group = lgp.name AND lgp.permission LIKE 'suffix.%'
            WHERE gm.guild_id = ?
            ORDER BY gr.priority DESC`,
            [guildInfo.id]
        );
        const membersWithData = memberRows.map(member => {
            const { style } = member.suffix_permission ? parseMinecraftColors(member.suffix_permission) : { style: '' };
            return { ...member, colorStyle: style };
        });
        res.json({ guildInfo, members: membersWithData });
    } catch (dbError) {
        console.error('Database query error (guild profile):', dbError);
        res.status(500).json({ error: 'Failed to fetch guild data.' });
    }
});

app.delete('/api/word/:id', isSeniorStaff, async (req, res) => {
    try {
        const { id } = req.params;
        await dbPool.execute('DELETE FROM `words` WHERE id = ?', [id]);
        res.json({ success: true, message: 'Word deleted successfully.' });
    } catch (dbError) {
        console.error('Database query error (delete word):', dbError);
        res.status(500).json({ error: 'Failed to delete word.' });
    }
});

app.put('/api/word/:id', isSeniorStaff, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason, note } = req.body;
        const updated_by = req.session.user.username;
        const finalReason = note ? `${reason} | ${note}` : reason;
        const is_banned = reason !== "Allowed";
        await dbPool.execute(
            'UPDATE `words` SET reason = ?, is_banned = ?, added_by = ?, last_edited = NOW() WHERE id = ?',
            [finalReason, is_banned, updated_by, id]
        );
        res.json({ success: true, message: 'Word updated successfully.' });
    } catch (dbError) {
        console.error('Database query error (update word):', dbError);
        res.status(500).json({ error: 'Failed to update word.' });
    }
});

app.get('/api/player/:username', async (req, res) => {
    try {
        const username = req.params.username;
        res.setHeader('Cache-Control', 'no-store');
        const sql = `
            SELECT
                au.username, 
                lp.primary_group, 
                lp.uuid,
                db.playtime,
                au.is_logged_in,
                lgp.permission AS suffix_permission,
                pvp.points, pvp.kills, pvp.deaths, pvp.shards,
                g.name AS guild_name,
                g.tag AS guild_tag,
                g.tag_color AS guild_tag_color
            FROM auth_users AS au
            LEFT JOIN luckperms_players AS lp ON au.uuid = lp.uuid
            LEFT JOIN deepbungee AS db ON au.uuid = db.uuid
            LEFT JOIN luckperms_group_permissions AS lgp ON lp.primary_group = lgp.name AND lgp.permission LIKE 'suffix.%'
            LEFT JOIN pvp_nullping AS pvp ON au.uuid = pvp.uuid
            LEFT JOIN guild_members AS gm ON au.uuid = gm.player_uuid
            LEFT JOIN guilds AS g ON gm.guild_id = g.id
            WHERE au.username = ?
        `;
        const [rows] = await dbPool.execute(sql, [username]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Player not found' });
        }
        const player = rows[0];
        const { style: colorStyle, hexColor } = player.suffix_permission 
            ? parseMinecraftColors(player.suffix_permission) 
            : { style: '', hexColor: '#00AAAA' };
        const { style: guildTagStyle } = player.guild_tag_color
            ? parseMinecraftColors(player.guild_tag_color)
            : { style: '' };
        res.json({ ...player, colorStyle, rankColor: hexColor || '#00AAAA', guildTagStyle });
    } catch (dbError) {
        console.error('Database query error (player profile):', dbError);
        res.status(500).json({ error: 'Failed to fetch player profile.' });
    }
});

app.listen(PORT, () => {
    console.log(`DeepMC server running at http://localhost:${PORT}`);
});