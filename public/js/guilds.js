document.addEventListener('DOMContentLoaded', () => {
    loadGuilds();
});

async function loadGuilds() {
    const container = document.getElementById('guilds-container');
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');
    const errorState = document.getElementById('error-state');
    
    // Show loading state
    showElement(loadingState);
    hideElement(emptyState);
    hideElement(errorState);
    
    try {
        const response = await fetch('/api/guilds');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const guilds = await response.json();
        
        // Hide loading state
        hideElement(loadingState);
        
        if (!guilds || guilds.length === 0) {
            showElement(emptyState);
            container.innerHTML = '';
            return;
        }

        // Render guild cards
        container.innerHTML = guilds.map(guild => createGuildCard(guild)).join('');
        
        // Add staggered animation
        animateGuildCards();
        
    } catch (error) {
        console.error('Failed to load guilds:', error);
        hideElement(loadingState);
        showElement(errorState);
        container.innerHTML = '';
    }
}

function createGuildCard(guild) {
    const ownerName = guild.owner_name || 'Unknown';
    const guildTag = guild.tag ? `[${guild.tag}]` : '';
    const memberCount = guild.member_count || 0;
    const createdDate = guild.created_at ? formatDate(guild.created_at) : 'Unknown';
    
    // Apply color styles
    const guildNameStyle = guild.tagColorStyle || '';
    const ownerColorStyle = guild.ownerColorStyle || '';
    
    return `
        <div class="guild-card" data-guild="${guild.name}">
            <div class="guild-header">
                <div class="guild-name-section">
                    <a href="/guild/${encodeURIComponent(guild.name)}" class="guild-name-link">
                        <h2 class="guild-name" style="${guildNameStyle}">${escapeHtml(guild.name)}</h2>
                        ${guildTag ? `<span class="guild-tag" style="${guildNameStyle}">${escapeHtml(guildTag)}</span>` : ''}
                    </a>
                </div>
            </div>
            
            <div class="guild-info">
                <div class="info-item">
                    <span class="info-label">Guild Owner</span>
                    <div class="info-value">
                        <a href="/profile/${encodeURIComponent(ownerName)}" class="player-profile-link" style="${ownerColorStyle}">
                            ${escapeHtml(ownerName)}
                        </a>
                    </div>
                </div>
                
                <div class="info-item">
                    <span class="info-label">Members</span>
                    <div class="info-value">
                        <span class="member-count">${memberCount}</span>
                    </div>
                </div>
                
                <div class="info-item">
                    <span class="info-label">Created</span>
                    <div class="info-value">
                        <span class="created-date">${createdDate}</span>
                    </div>
                </div>
                
                <div class="info-item">
                    <span class="info-label">Status</span>
                    <div class="info-value">
                        <span class="guild-status">Active</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return `${months} month${months > 1 ? 's' : ''} ago`;
        } else {
            const years = Math.floor(diffDays / 365);
            return `${years} year${years > 1 ? 's' : ''} ago`;
        }
    } catch (error) {
        return new Date(dateString).toLocaleDateString();
    }
}

function animateGuildCards() {
    const cards = document.querySelectorAll('.guild-card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            card.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, index * 100);
    });
}

function showElement(element) {
    if (element) {
        element.style.display = 'block';
    }
}

function hideElement(element) {
    if (element) {
        element.style.display = 'none';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add search functionality (optional enhancement)
function initializeSearch() {
    const searchInput = document.getElementById('guild-search');
    if (!searchInput) return;
    
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filterGuilds(e.target.value.toLowerCase());
        }, 300);
    });
}

function filterGuilds(searchTerm) {
    const cards = document.querySelectorAll('.guild-card');
    let visibleCount = 0;
    
    cards.forEach(card => {
        const guildName = card.querySelector('.guild-name').textContent.toLowerCase();
        const ownerName = card.querySelector('.player-profile-link').textContent.toLowerCase();
        
        const isVisible = guildName.includes(searchTerm) || ownerName.includes(searchTerm);
        
        if (isVisible) {
            card.style.display = 'block';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });
    
    // Show/hide empty state based on search results
    const emptyState = document.getElementById('empty-state');
    if (visibleCount === 0 && searchTerm) {
        showElement(emptyState);
        emptyState.querySelector('h3').textContent = 'No Guilds Found';
        emptyState.querySelector('p').textContent = `No guilds match your search for "${searchTerm}".`;
    } else {
        hideElement(emptyState);
    }
}