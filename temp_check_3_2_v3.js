console.log('Part 3_2 Start');
// --- PROJECT LOGIC ---
// Combined with Roadmap Selection logic from previous file

// We need to re-expose these if they were in the previous file but needed here?
// Actually they are global window functions so it is fine.

window.openRoadmapSelectionModal = openRoadmapSelectionModal;
window.closeRoadmapSelectionModal = closeRoadmapSelectionModal;
window.selectRoadmap = selectRoadmap;

function renderProjects() {
    const container = document.getElementById('project-list-container');
    if (!container) return;

    // Fetch Goals if not loaded (needed for "Active Roadmap" tag)
    if (!window.loadedGoals) {
        google.script.run.withSuccessHandler(goals => {
            window.loadedGoals = goals;
            if (!window.loadedProjects || window.loadedProjects.length === 0) {
                fetchProjects();
            } else {
                renderProjectsFromData(window.loadedProjects);
            }
        }).getGoalsV2();
        container.innerHTML = '<div class="spinner"></div>';
        return;
    }

    if (!window.loadedProjects || window.loadedProjects.length === 0) {
        fetchProjects();
    } else {
        renderProjectsFromData(window.loadedProjects);
    }
}

function fetchProjects() {
    const container = document.getElementById('project-list-container');
    if (container) container.innerHTML = '<div class="spinner"></div>';

    google.script.run.withSuccessHandler(projects => {
        window.loadedProjects = projects;
        renderProjectsFromData(projects);
    }).getProjects();
}

function renderProjectsFromData(projects) {
    const container = document.getElementById('project-list-container');
    if (!container) return;

    if (!projects || projects.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:30px; color:#aaa;">No projects found</div>';
        return;
    }

    let html = '';
    projects.forEach(p => {
        // Find Active Roadmap
        let activeTag = '';
        if (window.loadedGoals) {
            // Find goal where projectId matches p.id and status is active
            const activeGoal = window.loadedGoals.find(g => String(g.projectId) === String(p.id) &&
                g.status === 'Active');
            if (activeGoal) {
                activeTag = `<div class="current-roadmap-tag">Running: ${activeGoal.title}</div>`;
            } else {
                activeTag = `<div class="current-roadmap-tag" style="background:#f0f0f0; color:#aaa;">No Active Roadmap</div>`;
            }
        }

        html += `
                            <div class="card-glass project-card" onclick="openProjectDetail('${p.id}')">
                                <div class="project-title">${p.title}</div>
                                <div class="project-vision">${p.vision || 'No Vision'}</div>
                                ${activeTag}
                            </div>
                            `;
    });
    container.innerHTML = html;
}

function openProjectDetail(id) {
    const p = window.loadedProjects.find(x => String(x.id) === String(id));
    if (!p) return;

    window.activeProjectId = id; // Set active project ID for roadmap linking

    // Update Title (Fix for "Project Title" bug)
    const titleEl = document.getElementById('pd-page-title');
    if (titleEl) titleEl.innerText = p.title;

    // Vision text population
    document.getElementById('pd-vision-card').innerHTML = p.vision || 'No vision';

    // Filter Roadmaps
    const goals = window.loadedGoals ? window.loadedGoals.filter(g => String(g.projectId) ===
        String(id)) : [];
    const listContainer = document.getElementById('pd-roadmap-list');

    if (goals.length === 0) {
        listContainer.innerHTML = '<div style="color:#999;">No roadmaps linked.</div>';
    } else {
        let html = '';
        goals.forEach(g => {
            // reuse simplified card
            const current = Number(g.metricCurrent) || 0;
            const target = Number(g.metricTarget) || 1;
            const percent = Math.min(100, Math.max(0, (current / target) * 100));

            // Determine badge style based on status
            let statusBadge = '';
            let badgeColor = '#999'; // Default for Pending/Inactive
            let badgeText = '未着手';

            if (g.status === 'Active') {
                badgeColor = '#2196F3'; // Blue for Active
                badgeText = '進行中';
            } else if (g.status === 'Done') {
                badgeColor = '#4CAF50'; // Green for Done
                badgeText = '完了';
            }

            statusBadge = `<span style="background-color:${badgeColor}; color:white; padding:2px 8px; border-radius:10px; font-size:10px; margin-left:8px; white-space:nowrap;">${badgeText}</span>`;


            html += `
                            <div class="goal-card" style="margin-bottom:10px; padding:15px; border-radius:12px;"
                                onclick="openGoalDetail('${g.id}', 'project')">
                                <div
                                    style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:5px;">
                                    <div style="font-weight:bold; color:#333; font-size:15px; padding-right:5px;">
                                        ${g.title}</div>
                                    ${statusBadge}
                                </div>
                                <div style="display:flex; align-items:center; gap:10px; margin-top:5px;">
                                    <div class="progress-container" style="flex:1; height:6px; margin-top:0;">
                                        <div class="progress-bar" style="width:${percent}%"></div>
                                    </div>
                                    <div style="font-size:11px; color:#666;">${current} / ${target}</div>
                                </div>
                            </div>
                            `;
        });
        listContainer.innerHTML = html;
    }

    // Switch
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-project-detail').classList.add('active');
}

// --- Roadmap Selection Logic ---
function openRoadmapSelectionModal() {
    const modal = document.getElementById('roadmap-selection-modal');
    if (!modal) return;

    const listContainer = document.getElementById('roadmap-selection-list');
    listContainer.innerHTML = '';

    // Filter goals: not error, and NOT already in this project
    // Note: activeProjectId global should be set by openProjectDetail
    const candidates = (window.loadedGoals || []).filter(g => {
        return !g.id.startsWith('error') && g.projectId !== window.activeProjectId;
    });

    if (candidates.length === 0) {
        listContainer.innerHTML = '<div style="padding:10px; color:#aaa;">追加できるロードマップがありません</div>';
    } else {
        candidates.forEach(g => {
            const div = document.createElement('div');
            div.className = 'card-glass';
            div.style.padding = '10px';
            div.style.cursor = 'pointer';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.onclick = () => selectRoadmap(g.id);
            div.innerHTML = `
                            <div style="font-weight:bold;">${g.title}</div>
                            <div style="font-size:12px; color:#aaa;">${g.metricLabel || ''}</div>
                            `;
            listContainer.appendChild(div);
        });
    }

    modal.classList.add('open');
    modal.style.display = 'flex';
}

function closeRoadmapSelectionModal() {
    const modal = document.getElementById('roadmap-selection-modal');
    if (modal) {
        modal.classList.remove('open');
        modal.style.display = 'none';
    }
}

function selectRoadmap(goalId) {
    if (!window.activeProjectId) return;
    closeRoadmapSelectionModal();

    // Optimistic update
    const g = window.loadedGoals.find(x => x.id === goalId);
    if (g) {
        g.projectId = window.activeProjectId;
        openProjectDetail(window.activeProjectId); // Re-render detail view
    }

    google.script.run.withSuccessHandler(() => {
        // Silent success or re-fetch
    }).updateGoalProject(goalId, window.activeProjectId);
}

function closeProjectDetail() {
    document.getElementById('view-project-detail').classList.remove('active');
    document.getElementById('view-projects').classList.add('active');
}

function openProjectModal() {
    document.getElementById('p-title').value = '';
    document.getElementById('p-vision').value = '';
    document.getElementById('project-modal').classList.add('open');
    document.getElementById('project-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('p-title').focus(), 100);
}

function closeProjectModal() {
    document.getElementById('project-modal').classList.remove('open');
    document.getElementById('project-modal').style.display = 'none';
}

function saveProject() {
    const title = document.getElementById('p-title').value;
    const vision = document.getElementById('p-vision').value;

    if (!title) {
        alert('タイトルを入力してください');
        return;
    }

    closeProjectModal();

    // Optimistic UI
    const tempId = 'temp-' + Date.now();
    const newProj = { id: tempId, title: title, vision: vision };

    if (!window.loadedProjects) window.loadedProjects = [];
    window.loadedProjects.push(newProj);
    renderProjectsFromData(window.loadedProjects);

    google.script.run.withSuccessHandler(serverProj => {
        // Replace temp details logic handled by full re-render on next fetch,
        // or just update local ID if possible.
        // For now, simple re-fetch or manual replace.
        // Let's replace the entry in loadedProjects and re-render.
        const idx = window.loadedProjects.findIndex(p => p.id === tempId);
        if (idx >= 0 && serverProj) {
            window.loadedProjects[idx] = serverProj;
            renderProjectsFromData(window.loadedProjects);
        }
    }).createProject(title, vision);
}

// Expose Project Functions
window.renderProjects = renderProjects;
window.fetchProjects = fetchProjects;
window.openProjectDetail = openProjectDetail;
window.closeProjectDetail = closeProjectDetail;
window.openProjectModal = openProjectModal;
window.closeProjectModal = closeProjectModal;
window.saveProject = saveProject;


// -------------------------------------------------------------------------
// EXPERIENCE LOGIC
// -------------------------------------------------------------------------
function fetchExperiences() {
    const container = document.getElementById('experience-grid');
    if (!container) return;

    // If empty, show loading
    if (container.children.length === 0 || container.innerHTML.includes('Loading')) {
        container.innerHTML = '<div class="spinner"></div>';
    }

    google.script.run.withSuccessHandler(list => {
        window.loadedExperiences = list;
        renderExperiences(list);
    }).getExperiences();
}

function renderExperiences(list) {
    const container = document.getElementById('experience-grid');
    if (!container) return;

    if (!list || list.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:50px; color:#aaa;">No experiences found.</div>';
        return;
    }

    let html = '';
    list.forEach(item => {
        const imgUrl = item.image ? item.image :
            'https://via.placeholder.com/300x200?text=No+Image';

        html += `
                            <div class="exp-card" onclick="openExperienceDetail('${item.id}')"
                                style="background:white; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.05); cursor:pointer;">
                                <div class="exp-img"
                                    style="height:120px; background-image:url('${imgUrl}'); background-size:cover; background-position:center;">
                                </div>
                                <div class="exp-content" style="padding:10px;">
                                    <div class="exp-title"
                                        style="font-weight:800; font-size:14px; color:#333; margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                        ${item.title}</div>
                                    <div class="exp-meta"
                                        style="display:flex; flex-direction:column; gap:2px; font-size:11px; color:#666;">
                                        <span style="display:flex; align-items:center; gap:3px;"><span
                                                class="material-symbols-rounded" style="font-size:12px;">payments</span>
                                            ${item.budget ? '¥' + item.budget : '--'}</span>
                                        <span style="display:flex; align-items:center; gap:3px;"><span
                                                class="material-symbols-rounded"
                                                style="font-size:12px;">location_on</span> ${item.location ||
            '--'}</span>
                                        <span style="display:flex; align-items:center; gap:3px;"><span
                                                class="material-symbols-rounded" style="font-size:12px;">schedule</span>
                                            ${item.duration || '--'}</span>
                                    </div>
                                </div>
                            </div>
                            `;
    });
    container.innerHTML = html;
}

// Expose Experience Functions
window.fetchExperiences = fetchExperiences;
window.renderExperiences = renderExperiences;

/* 
// TEMPORARILY COMMENTED OUT - EXPERIENCE DETAIL MODAL & SAVE LOGIC & OPEN DETAIL
// This section is suspected to contain the SyntaxError.

function openExperienceDetail(id) {
    const item = (window.loadedExperiences || []).find(x => String(x.id) === String(id));
    if (!item) return;

    document.getElementById('edm-id').value = item.id;

    document.getElementById('edm-title').value = item.title;
    document.getElementById('edm-status').value = item.status;
    document.getElementById('edm-budget').value = item.budget;
    document.getElementById('edm-duration').value = item.duration;
    document.getElementById('edm-location').value = item.location;
    document.getElementById('edm-desc').value = item.description;

    // Image
    const imgUrl = item.image || '';
    document.getElementById('edm-img-container').style.backgroundImage = `url('${imgUrl}')`;
    document.getElementById('edm-image-input').value = imgUrl;

    // Map URL (stored in item.url)
    document.getElementById('edm-map-url').value = item.url;
    // Init logic
    handleLocationInput(document.getElementById('edm-location'));
    detectDescriptionLink();

    const modal = document.getElementById('experience-detail-modal');
    modal.classList.add('open');
    modal.style.display = 'flex';
}

function detectDescriptionLink() {
    const desc = document.getElementById('edm-desc').value;
    const linkBtn = document.getElementById('edm-desc-link-btn');
    const linkText = document.getElementById('edm-desc-link-text');

    // Simple regex for URL
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = desc.match(urlRegex);

    if (match && match.length > 0) {
        const url = match[0];
        linkBtn.href = url;
        linkText.innerText = 'Go to: ' + new URL(url).hostname;
        linkBtn.style.display = 'flex';
    } else {
        linkBtn.style.display = 'none';
    }
}

function handleLocationInput(input) {
    const val = input.value;
    const mapUrlField = document.getElementById('edm-map-url');
    const mapBtn = document.getElementById('edm-map-btn');

    if (val.includes('maps.google.com') || val.includes('goo.gl/maps') ||
        val.includes('google.com/maps')) {
        // It's a map URL
        // Try to extract name if possible, or just set URL
        // Google Maps URL usually has /place/NAME/...
        const placeRegex = /\/place\/([^\/]+)/;
        const match = val.match(placeRegex);

        if (match && match[1]) {
            // Decode and replace + with space
            const name = decodeURIComponent(match[1].replace(/\+/g, ' '));
            input.value = name;
        }

        mapUrlField.value = val; // Store full URL
        mapBtn.style.display = 'inline-block';
    } else {
        // Not a URL, treat as name
        // If empty, hide map link unless we search
        // We can search map with this name
        mapUrlField.value = '';
        mapBtn.style.display = val ? 'inline-block' : 'none';
    }
}

function openMap() {
    const mapUrl = document.getElementById('edm-map-url').value;
    const locationName = document.getElementById('edm-location').value;

    if (mapUrl) {
        window.open(mapUrl, '_blank');
    } else if (locationName) {
        // Search Google Maps
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationName)}`,
            '_blank');
    }
}

// Updated Auto Save

function autoSaveExperience() {
    const id = document.getElementById('edm-id').value;
    const title = document.getElementById('edm-title').value;
    const status = document.getElementById('edm-status').value;
    const budget = document.getElementById('edm-budget').value;
    const duration = document.getElementById('edm-duration').value;
    const location = document.getElementById('edm-location').value;
    const description = document.getElementById('edm-desc').value;
    const url = document.getElementById('edm-url').value;
    const image = document.getElementById('edm-image-input').value;

    // If title is cleared, maybe don't save? Or allow it?
    // For auto-save, we can't block easily with alert.
    // Let's check basics.
    if (!title) return; // Do not save if title missing.

    const item = {
        id: id,
        title: title,
        status: status,
        budget: budget,
        duration: duration,
        location: location,
        description: description,
        url: url,
        image: image
    };

    const statusLabel = document.getElementById('edm-save-status');
    if (statusLabel) statusLabel.innerText = 'Saving...';

    google.script.run.withSuccessHandler(res => {
        if (statusLabel) statusLabel.innerText = 'Saved';
        // Slight delay then clear?
        setTimeout(() => { if (statusLabel.innerText === 'Saved') statusLabel.innerText = ''; },
            2000);

        // Should we refresh the list immediately?
        // It might cause jitter if typing fast.
        // Maybe only refresh on close? Or update local list 'loadedExperiences'
        updateLocalExperience(item);
    }).saveExperience(item);
}

function updateLocalExperience(updatedItem) {
    if (!window.loadedExperiences) return;
    const idx = window.loadedExperiences.findIndex(x => String(x.id) === String(updatedItem.id));
    if (idx !== -1) {
        window.loadedExperiences[idx] = updatedItem;
    } else {
        window.loadedExperiences.push(updatedItem);
    }
}

// expose new functions
window.detectDescriptionLink = detectDescriptionLink;
window.handleLocationInput = handleLocationInput;
window.openMap = openMap;
window.openExperienceDetail = openExperienceDetail;
window.closeExperienceDetail = function () {
    const modal = document.getElementById('experience-detail-modal');
    modal.classList.remove('open');
    modal.style.display = 'none';
    // Refresh list on close to reflect edits
    fetchExperiences();
};
window.autoSaveExperience = autoSaveExperience;
*/
console.log('Part 3_2 End - Partial Restore (Projects + Exp Fetch)');
