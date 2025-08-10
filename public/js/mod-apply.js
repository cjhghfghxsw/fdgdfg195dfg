document.addEventListener('DOMContentLoaded', async function() {
    await checkApplicationStatus();
});

async function checkApplicationStatus() {
    try {
        const response = await fetch('/api/mod-apply/status');
        const data = await response.json();
        
        if (!response.ok) {
            if (response.status === 401) {
                showLoginRequired();
            } else {
                throw new Error(data.error || 'Failed to load application status');
            }
            return;
        }

        if (data.canApply) {
            showApplicationForm(data.playerStats);
        } else {
            showApplicationStatus(data);
        }

        // Show previous applications if any exist
        if (data.previousApplications && data.previousApplications.length > 0) {
            showPreviousApplications(data.previousApplications);
        }

    } catch (error) {
        console.error('Error checking application status:', error);
        showError('Failed to load application status. Please try again later.');
    }
}

function showLoginRequired() {
    document.getElementById('application-content').innerHTML = `
        <div class="notice-box info">
            <i class="fas fa-sign-in-alt"></i>
            <strong>Login Required</strong><br>
            You must be logged in to submit a moderator application.
            <br><br>
            <a href="/login" style="color: #55FFFF; text-decoration: underline;">Click here to login</a>
        </div>
    `;
}

function showApplicationForm(playerStats) {
    const meetsRequirements = 
        playerStats.playtime >= 0 && // 50 hours in milliseconds
        playerStats.recentPunishments === 0 &&
        playerStats.discordLinked;

    let requirementsHtml = '';
    if (!meetsRequirements) {
        let issues = [];
        if (playerStats.playtime < 180000000) {
            issues.push(`You need ${Math.ceil((180000000 - playerStats.playtime) / 3600000)} more hours of playtime.`);
        }
        if (playerStats.recentPunishments > 0) {
            issues.push('You have recent punishments that prevent you from applying.');
        }
        if (!playerStats.discordLinked) {
            issues.push('You must link your Discord account using /discord link in-game.');
        }

        requirementsHtml = `
            <div class="notice-box error">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Requirements Not Met</strong><br>
                ${issues.join(' ')}
                Please come back when you meet all requirements.
            </div>
        `;
    }

    document.getElementById('application-content').innerHTML = `
        ${requirementsHtml}
        <form id="mod-application-form" class="application-form" ${!meetsRequirements ? 'style="display: none;"' : ''}>
            <div class="form-section">
                <h3>Personal Information</h3>
                
                <div class="form-group">
                    <label for="real-name">Real Name (First name only)</label>
                    <input type="text" id="real-name" name="real_name" required maxlength="50">
                </div>

                <div class="form-group">
                    <label for="age">Age</label>
                    <select id="age" name="age" required>
                        <option value="">Select your age</option>
                        <option value="13">13</option>
                        <option value="14">14</option>
                        <option value="15">15</option>
                        <option value="16">16</option>
                        <option value="17">17</option>
                        <option value="18">18+</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="timezone">Timezone</label>
                    <select id="timezone" name="timezone" required>
                        <option value="">Select your timezone</option>
                        <option value="EST">EST (Eastern)</option>
                        <option value="CST">CST (Central)</option>
                        <option value="MST">MST (Mountain)</option>
                        <option value="PST">PST (Pacific)</option>
                        <option value="GMT">GMT (Greenwich Mean Time)</option>
                        <option value="CET">CET (Central European Time)</option>
                        <option value="OTHER">Other</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="discord">Discord Username</label>
                    <input type="text" id="discord" name="discord" value="${playerStats.discordUsername || ''}" readonly 
                           style="background-color: #1a1a1a; color: #55FFFF; border-color: #00AAAA;">
                    <small style="color: #888; font-size: 0.85em; margin-top: 5px; display: block;">
                        <i class="fas fa-info-circle"></i> This is automatically filled from your linked Discord account.
                    </small>
                </div>
            </div>

            <div class="form-section">
                <h3>Experience & Motivation</h3>
                
                <div class="form-group">
                    <label for="experience">Previous Moderation Experience</label>
                    <textarea id="experience" name="experience" 
                        placeholder="Describe any previous experience as a moderator on Minecraft servers, Discord servers, or other platforms. If you have no experience, explain why you'd like to start here." 
                        required maxlength="500"></textarea>
                    <div class="char-counter" data-target="experience">0/500</div>
                </div>

                <div class="form-group">
                    <label for="motivation">Why do you want to become a moderator?</label>
                    <textarea id="motivation" name="motivation" 
                        placeholder="Explain your motivation for wanting to become a moderator on DeepMC. What do you hope to contribute to the community?" 
                        required maxlength="500"></textarea>
                    <div class="char-counter" data-target="motivation">0/500</div>
                </div>

                <div class="form-group">
                    <label for="availability">When are you usually online?</label>
                    <textarea id="availability" name="availability" 
                        placeholder="Describe your typical online schedule, including weekdays and weekends. Be specific about times and duration." 
                        required maxlength="300"></textarea>
                    <div class="char-counter" data-target="availability">0/300</div>
                </div>
            </div>

            <div class="form-section">
                <h3>Scenario Questions</h3>
                
                <div class="form-group">
                    <label for="scenario1">A player is repeatedly using inappropriate language in chat despite warnings. How would you handle this?</label>
                    <textarea id="scenario1" name="scenario1" 
                        placeholder="Describe your approach to handling this situation step by step." 
                        required maxlength="400"></textarea>
                    <div class="char-counter" data-target="scenario1">0/400</div>
                </div>

                <div class="form-group">
                    <label for="scenario2">Two players are arguing and the situation is escalating. What steps would you take?</label>
                    <textarea id="scenario2" name="scenario2" 
                        placeholder="Explain how you would de-escalate this situation and what actions you might take." 
                        required maxlength="400"></textarea>
                    <div class="char-counter" data-target="scenario2">0/400</div>
                </div>
            </div>

            <button type="submit" class="submit-btn">
                <i class="fas fa-paper-plane"></i> Submit Application
            </button>
        </form>
    `;

    // Add character counters
    setupCharacterCounters();
    
    // Add form submission handler
    document.getElementById('mod-application-form').addEventListener('submit', handleFormSubmission);
}

function showApplicationStatus(data) {
    let statusHtml = '';
    
    // Check if applications are closed
    if (data.playerStats && data.playerStats.applicationsOpen === false) {
        statusHtml = `
            <div class="notice-box error">
                <i class="fas fa-times-circle"></i>
                <strong>Applications Closed</strong><br>
                Moderator applications are currently closed. Please check back later when applications are reopened.
            </div>
        `;
        document.getElementById('application-content').innerHTML = statusHtml;
        return;
    }
    
    if (data.currentApplication) {
        const app = data.currentApplication;
        let statusClass = 'pending';
        let statusIcon = 'fas fa-clock';
        let statusText = 'Under Review';
        
        if (app.status === 'approved') {
            statusClass = 'success';
            statusIcon = 'fas fa-check-circle';
            statusText = 'Approved';
        } else if (app.status === 'denied') {
            statusClass = 'error';
            statusIcon = 'fas fa-times-circle';
            statusText = 'Denied';
        }

        statusHtml = `
            <div class="notice-box ${statusClass}">
                <i class="${statusIcon}"></i>
                <strong>Application Status: ${statusText}</strong><br>
                Submitted on ${new Date(app.created_at).toLocaleDateString()}
                ${app.response ? `<br><br><strong>Staff Response:</strong><br>${app.response}` : ''}
            </div>
        `;

        if (app.status === 'denied') {
            const daysSinceDenied = Math.floor((Date.now() - new Date(app.created_at).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceDenied >= 30) {
                statusHtml += `
                    <div class="notice-box info">
                        <strong>You can submit a new application!</strong><br>
                        It has been over 30 days since your last denied application.
                    </div>
                `;
                // Allow them to apply again if applications are open
                if (data.playerStats.applicationsOpen !== false) {
                    showApplicationForm(data.playerStats);
                    return;
                }
            } else {
                statusHtml += `
                    <div class="notice-box info">
                        You can reapply in ${30 - daysSinceDenied} days.
                    </div>
                `;
            }
        }
    } else if (!data.canApply) {
        statusHtml = `
            <div class="notice-box error">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Cannot Apply</strong><br>
                ${data.reason || 'You do not meet the requirements to apply for moderator.'}
            </div>
        `;
    }

    document.getElementById('application-content').innerHTML = statusHtml;
}
    
function showPreviousApplications(applications) {
    const previousSection = document.createElement('div');
    previousSection.className = 'previous-applications';
    
    let applicationsHtml = `
        <h3><i class="fas fa-history"></i> Previous Applications</h3>
    `;

    applications.forEach(app => {
        let statusClass = 'pending';
        if (app.status === 'approved') statusClass = 'approved';
        if (app.status === 'denied') statusClass = 'denied';

        applicationsHtml += `
            <div class="application-item">
                <div class="application-header">
                    <span class="application-date">${new Date(app.created_at).toLocaleDateString()}</span>
                    <span class="status-badge status-${statusClass}">${app.status}</span>
                </div>
                ${app.response ? `
                    <div class="application-response">
                        <h5>Staff Response:</h5>
                        <p>${app.response}</p>
                    </div>
                ` : ''}
            </div>
        `;
    });

    previousSection.innerHTML = applicationsHtml;
    document.querySelector('.application-container').appendChild(previousSection);
}

function setupCharacterCounters() {
    const textareas = document.querySelectorAll('textarea[maxlength]');
    
    textareas.forEach(textarea => {
        const counter = document.querySelector(`[data-target="${textarea.id}"]`);
        if (!counter) return;

        function updateCounter() {
            const current = textarea.value.length;
            const max = parseInt(textarea.getAttribute('maxlength'));
            counter.textContent = `${current}/${max}`;
            
            // Add warning/error classes
            counter.classList.remove('warning', 'error');
            if (current > max * 0.9) {
                counter.classList.add('warning');
            }
            if (current >= max) {
                counter.classList.add('error');
            }
        }

        textarea.addEventListener('input', updateCounter);
        updateCounter(); // Initial count
    });
}

async function handleFormSubmission(event) {
    event.preventDefault();
    
    const form = event.target;
    const submitBtn = form.querySelector('.submit-btn');
    const formData = new FormData(form);
    
    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    
    try {
        const response = await fetch('/api/mod-apply/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(Object.fromEntries(formData))
        });

        const result = await response.json();

        if (response.ok) {
            showSuccess('Application submitted successfully! You will receive a response within 7 days.');
            // Refresh the page to show new status
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            throw new Error(result.message || 'Failed to submit application');
        }

    } catch (error) {
        console.error('Error submitting application:', error);
        showError(error.message || 'Failed to submit application. Please try again.');
        
        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Application';
    }
}

function showSuccess(message) {
    const content = document.getElementById('application-content');
    content.innerHTML = `
        <div class="notice-box success">
            <i class="fas fa-check-circle"></i>
            <strong>Success!</strong><br>
            ${message}
        </div>
    `;
}

function showError(message) {
    const existingNotice = document.querySelector('.notice-box.error');
    if (existingNotice) {
        existingNotice.remove();
    }

    const errorNotice = document.createElement('div');
    errorNotice.className = 'notice-box error';
    errorNotice.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i>
        <strong>Error!</strong><br>
        ${message}
    `;

    const form = document.getElementById('mod-application-form');
    if (form) {
        form.parentNode.insertBefore(errorNotice, form);
    } else {
        document.getElementById('application-content').appendChild(errorNotice);
    }
}