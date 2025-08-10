document.addEventListener('DOMContentLoaded', function() {
    loadFriends();
});

let currentFriends = [];

async function loadFriends() {
    const loadingState = document.getElementById('loading-state');
    const friendsContainer = document.getElementById('friends-container');
    const emptyState = document.getElementById('empty-state');
    const errorState = document.getElementById('error-state');
    const friendsTableBody = document.getElementById('friends-table-body');
    const friendsCount = document.getElementById('friends-count');
    

    try {
        // Show loading state
        showElement(loadingState);
        hideElement(friendsContainer);
        hideElement(emptyState);
        hideElement(errorState);

        const response = await fetch('/api/my-friends');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        currentFriends = data.friends || [];
console.log("Friends loaded from API:", currentFriends);


        // Hide loading state
        hideElement(loadingState);

        // Update friends count
        friendsCount.textContent = `(${currentFriends.length})`;

        if (currentFriends.length === 0) {
            showElement(emptyState);
            return;
        }

        // Show friends table and populate it
        showElement(friendsContainer);
        friendsTableBody.innerHTML = currentFriends.map((friend, index) => 
            createFriendRow(friend, index)
        ).join('');

        // Add animations
        animateFriendRows();

    } catch (error) {
        console.error('Error loading friends:', error);
        hideElement(loadingState);
        hideElement(friendsContainer);
        showElement(errorState);
    }
}

function createFriendRow(friend, index) {
    const sinceDate = formatRelativeDate(friend.since);
    const lastSeenDate = friend.last_seen ? formatRelativeDate(friend.last_seen) : 'Never';
    const isOnline = isRecentlyActive(friend.last_seen);
    
    return `
        <tr class="friend-row" style="animation-delay: ${index * 50}ms" data-username="${friend.username}">
            <td class="avatar-col">
                <img src="${friend.avatar}" alt="${friend.username}" class="friend-avatar" 
                     onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjNDQ0Ii8+CjxjaXJjbGUgY3g9IjIwIiBjeT0iMTYiIHI9IjYiIGZpbGw9IiNjY2MiLz4KPHBhdGggZD0iTTEwIDMwYzAtNS41IDQuNS0xMCAxMC0xMHMxMCA0LjUgMTAgMTB2NGgtMjB2LTR6IiBmaWxsPSIjY2NjIi8+Cjwvc3ZnPgo='">
            </td>
            <td class="username-col">
                <a href="/profile/${encodeURIComponent(friend.username)}" class="friend-username" style="${friend.colorStyle || ''}">
                    <div class="username-badge">
                        <span>${escapeHtml(friend.username)}</span>
                        ${friend.rank ? `<span class="user-rank">${escapeHtml(friend.rank)}</span>` : ''}
                    </div>
                </a>
            </td>
            <td class="since-col">
                <div class="friend-since">
                    <span class="date-relative">${sinceDate}</span>
                </div>
            </td>
            <td class="last-seen-col">
                <div class="friend-last-seen">
                    <span class="date-relative">${lastSeenDate}</span>
                </div>
            </td>
            <td class="status-col">
                <div class="friend-status ${isOnline ? 'status-online' : 'status-offline'}">
                    <i class="fas fa-circle"></i>
                    ${isOnline ? 'Online' : 'Offline'}
                </div>
            </td>
            <td class="actions-col">
                <div class="friend-actions">
                    <button class="btn-remove" onclick="showRemoveModal('${escapeHtml(friend.username)}', '${friend.uuid}')">
                        <i class="fas fa-user-minus"></i>
                        Remove
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function formatRelativeDate(dateString) {
    if (!dateString) return 'Never';
    
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

function isRecentlyActive(lastSeenString) {
    if (!lastSeenString) return false;
    
    const lastSeen = new Date(lastSeenString);
    const now = new Date();
    const diffMinutes = Math.abs(now - lastSeen) / (1000 * 60);
    
    // Consider online if seen within the last 15 minutes
    return diffMinutes <= 15;
}

function animateFriendRows() {
    const rows = document.querySelectorAll('.friend-row');
    rows.forEach((row, index) => {
        row.style.opacity = '0';
        row.style.transform = 'translateY(10px)';
        
        setTimeout(() => {
            row.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
            row.style.opacity = '1';
            row.style.transform = 'translateY(0)';
        }, index * 50);
    });
}

// Modal Functions
function showRemoveModal(username, friendUuid) {
    const modal = document.getElementById('remove-modal');
    const friendNameEl = document.getElementById('remove-friend-name');
    const confirmBtn = document.getElementById('confirm-remove-btn');
    
    friendNameEl.textContent = username;
    confirmBtn.onclick = () => removeFriend(friendUuid, username);
    
    showElement(modal);
    document.body.style.overflow = 'hidden';
}

function closeRemoveModal() {
    const modal = document.getElementById('remove-modal');
    hideElement(modal);
    document.body.style.overflow = 'auto';
}

async function removeFriend(friendUuid, username) {
    const confirmBtn = document.getElementById('confirm-remove-btn');
    const originalText = confirmBtn.innerHTML;

    // Quick sanity check for UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(friendUuid)) {
        console.error('Invalid UUID for friend:', friendUuid);
        showNotification('Error: Invalid friend ID. Please refresh.', 'error');
        return;
    }
    
    try {
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Removing...';
        confirmBtn.disabled = true;
        
        const response = await fetch('/api/remove-friend', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ friendId: friendUuid })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to remove friend: ${response.status}`);
        }
        
        const friendRow = document.querySelector(`[data-username="${username}"]`);
        if (friendRow) {
            friendRow.style.transition = 'all 0.3s ease';
            friendRow.style.opacity = '0';
            friendRow.style.transform = 'translateX(-20px)';
            
            setTimeout(() => {
                friendRow.remove();
                updateFriendsCount();
                
                if (document.querySelectorAll('.friend-row').length === 0) {
                    hideElement(document.getElementById('friends-container'));
                    showElement(document.getElementById('empty-state'));
                }
            }, 300);
        }
        
        closeRemoveModal();
        showNotification(`${username} has been removed from your friends list`, 'success');
        
    } catch (error) {
        console.error('Error removing friend:', error);
        showNotification('Failed to remove friend. Please try again.', 'error');
        
        confirmBtn.innerHTML = originalText;
        confirmBtn.disabled = false;
    }
}

function updateFriendsCount() {
    const friendsCount = document.getElementById('friends-count');
    const currentCount = document.querySelectorAll('.friend-row').length;
    friendsCount.textContent = `(${currentCount})`;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Utility Functions
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
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('click', (e) => {
    const modal = document.getElementById('remove-modal');
    if (e.target === modal) {
        closeRemoveModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeRemoveModal();
    }
});
