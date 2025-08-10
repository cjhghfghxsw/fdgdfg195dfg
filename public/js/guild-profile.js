document.addEventListener('DOMContentLoaded', () => {
    loadGuildProfile();
});

async function loadGuildProfile() {
    const contentArea = document.getElementById('guild-profile-content');
    const guildName = decodeURIComponent(window.location.pathname.split('/').pop());

    try {
        const response = await fetch(`/api/guild/${guildName}`);
        if (!response.ok) throw new Error('Guild not found');
        
        const { guildInfo, members } = await response.json();

        // Sort members to easily find the leader (highest priority)
        members.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        // Extract key info for the new design
        const guildLeader = members.length > 0 ? members[0].username : 'N/A';
        const guildEmblemInitial = guildInfo.name ? guildInfo.name.charAt(0).toUpperCase() : '?';

        // Generate the new HTML structure for the profile card
        const guildProfileHtml = `
            <div class="guild-profile-wrapper">
                <header class="profile-header">
                    <div class="guild-emblem">${guildEmblemInitial}</div>
                    <div class="guild-identity">
                        <h1>${guildInfo.name}</h1>
                        ${guildInfo.tag ? `<span class="guild-tag">${guildInfo.tag}</span>` : ''}
                    </div>
                </header>

                <div class="profile-stats-bar">
                    <div class="stat-item">
                        <div class="stat-label">Leader</div>
                        <div class="stat-value">${guildLeader}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Members</div>
                        <div class="stat-value">${guildInfo.member_count}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Created</div>
                        <div class="stat-value">${new Date(guildInfo.created_at).toLocaleDateString()}</div>
                    </div>
                </div>

                <section class="profile-members-section">
                    <h2>Members</h2>
                    <table class="members-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Guild Role</th>
                                <th>Joined</th>
                                <th>Last Login</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${members.map(member => `
                                <tr>
                                    <td><a href="/profile/${member.username}" class="player-profile-link" style="${member.colorStyle || ''}">${member.username}</a></td>
                                    <td>${member.guild_rank_name || 'Unknown'}</td>
                                    <td>${new Date(member.joined_at).toLocaleDateString()}</td>
                                    <td>${member.last_login ? new Date(member.last_login).toLocaleString() : 'Never'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </section>
            </div>
        `;

        contentArea.innerHTML = guildProfileHtml;

    } catch (error) {
        contentArea.innerHTML = `<h1>Error: ${error.message}</h1>`;
    }
}