
    console.log('Part 3_2 Start');

    window.openRoadmapSelectionModal = openRoadmapSelectionModal;
    window.closeRoadmapSelectionModal = closeRoadmapSelectionModal;
    window.selectRoadmap = selectRoadmap;

    function renderProjects() {
        const container = document.getElementById('project-list-container');
        if (!container) return;

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
            let activeTag = '';
            if (window.loadedGoals) {
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

        window.activeProjectId = id;

        const titleEl = document.getElementById('pd-page-title');
        if (titleEl) titleEl.innerText = p.title;

        document.getElementById('pd-vision-card').innerHTML = p.vision || 'No vision';

        const goals = window.loadedGoals ? window.loadedGoals.filter(g => String(g.projectId) ===
            String(id)) : [];
        const listContainer = document.getElementById('pd-roadmap-list');

        if (goals.length === 0) {
            listContainer.innerHTML = '<div style="color:#999;">No roadmaps linked.</div>';
        } else {
            let html = '';
            goals.forEach(g => {
                const current = Number(g.metricCurrent) || 0;
                const target = Number(g.metricTarget) || 1;
                const percent = Math.min(100, Math.max(0, (current / target) * 100));

                let statusBadge = '';
                let badgeColor = '#999';
                let badgeText = '未着手';

                if (g.status === 'Active') {
                    badgeColor = '#2196F3';
                    badgeText = '進行中';
                } else if (g.status === 'Done') {
                    badgeColor = '#4CAF50';
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

        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-project-detail').classList.add('active');
    }

    function openRoadmapSelectionModal() {
        const modal = document.getElementById('roadmap-selection-modal');
        if (!modal) return;

        const listContainer = document.getElementById('roadmap-selection-list');
        listContainer.innerHTML = '';

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

        const g = window.loadedGoals.find(x => x.id === goalId);
        if (g) {
            g.projectId = window.activeProjectId;
            openProjectDetail(window.activeProjectId);
        }

        google.script.run.withSuccessHandler(() => {
        }).updateGoalProject(goalId, window.activeProjectId);
    }

    function closeProjectDetail() {
        document.getElementById('view-project-detail').classList.remove('active');
        document.getElementById('view-projects').classList.add('active');
    }

    function openProjectModal() {
        document.getElementById('p-id').value = ''; // Clear ID for new project
        document.getElementById('p-title').value = '';
        document.getElementById('p-vision').value = '';
        document.getElementById('project-modal').classList.add('open');
        document.getElementById('project-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('p-title').focus(), 100);
    }

    function openEditProjectModal() {
        const id = window.activeProjectId;
        if (!id) return;
        const p = window.loadedProjects.find(x => String(x.id) === String(id));
        if (!p) return;

        document.getElementById('p-id').value = p.id;
        document.getElementById('p-title').value = p.title;
        document.getElementById('p-vision').value = p.vision || '';
        document.getElementById('project-modal').classList.add('open');
        document.getElementById('project-modal').style.display = 'flex';
    }

    function closeProjectModal() {
        document.getElementById('project-modal').classList.remove('open');
        document.getElementById('project-modal').style.display = 'none';
    }

    function saveProject() {
        const title = document.getElementById('p-title').value;
        const vision = document.getElementById('p-vision').value;
        const id = document.getElementById('p-id').value;

        if (!title) {
            alert('タイトルを入力してください');
            return;
        }

        closeProjectModal();

        if (id) {
            // --- UPDATE EXISTING ---
            // Optimistic UI Update
            const idx = window.loadedProjects.findIndex(p => String(p.id) === String(id));
            if (idx >= 0) {
                window.loadedProjects[idx].title = title;
                window.loadedProjects[idx].vision = vision;
                // Update Detail View immediately if active
                if (window.activeProjectId === id) {
                    const titleEl = document.getElementById('pd-page-title');
                    if (titleEl) titleEl.innerText = title;
                    const visionEl = document.getElementById('pd-vision-card');
                    if (visionEl) visionEl.innerHTML = vision || 'No vision'; // Ensure innerHTML for consistency
                }
                renderProjectsFromData(window.loadedProjects); // Refresh list
            }

            // Server Call
            google.script.run.withSuccessHandler(serverProj => {
                console.log('Update Complete', serverProj);
            }).updateProject(id, title, vision);

        } else {
            // --- CREATE NEW ---
            const tempId = 'temp-' + Date.now();
            const newProj = { id: tempId, title: title, vision: vision };

            if (!window.loadedProjects) window.loadedProjects = [];
            window.loadedProjects.push(newProj);
            renderProjectsFromData(window.loadedProjects);

            google.script.run.withSuccessHandler(serverProj => {
                const idx = window.loadedProjects.findIndex(p => p.id === tempId);
                if (idx >= 0 && serverProj) {
                    window.loadedProjects[idx] = serverProj;
                    renderProjectsFromData(window.loadedProjects);
                }
            }).createProject(title, vision);
        }
    }

    window.renderProjects = renderProjects;
    window.fetchProjects = fetchProjects;
    window.openProjectDetail = openProjectDetail;
    window.closeProjectDetail = closeProjectDetail;
    window.openProjectModal = openProjectModal;
    window.openEditProjectModal = openEditProjectModal;
    window.closeProjectModal = closeProjectModal;
    window.saveProject = saveProject;

    function fetchExperiences() {
        const container = document.getElementById('experience-grid');
        if (!container) return;

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
                'https://placehold.co/300x200?text=No+Image';

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
                                            ${(item.budget || item.budget === 0) ? '¥' + item.budget : '--'}</span>
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

    window.fetchExperiences = fetchExperiences;
    window.renderExperiences = renderExperiences;

    function openCreateExperienceModal() {
        console.log('openCreateExperienceModal called');

        // Clear Fields
        document.getElementById('edm-id').value = '';
        document.getElementById('edm-title').value = '';
        document.getElementById('edm-status').value = 'List'; // Default
        document.getElementById('edm-budget').value = '';
        document.getElementById('edm-duration').value = '';
        document.getElementById('edm-location').value = '';
        document.getElementById('edm-desc').value = '';

        // Clear Map/Img
        const imgInput = document.getElementById('edm-image-input');
        if (imgInput) imgInput.value = '';
        document.getElementById('edm-img-container').style.backgroundImage = 'none';

        const mapUrlField = document.getElementById('edm-map-url');
        if (mapUrlField) mapUrlField.value = '';
        const mapBtn = document.getElementById('edm-map-btn');
        if (mapBtn) mapBtn.style.display = 'none';

        const linkBtn = document.getElementById('edm-desc-link-btn');
        if (linkBtn) linkBtn.style.display = 'none';

        // Show Modal
        const modal = document.getElementById('experience-detail-modal');
        if (modal) {
            modal.classList.add('open');
            modal.style.display = 'flex';
        }
    }

    function openExperienceDetail(id) {
        console.log('openExperienceDetail called with ID:', id);
        const item = (window.loadedExperiences || []).find(x => String(x.id) === String(id));
        if (!item) {
            console.warn('Experience item not found for ID:', id);
            return;
        }

        document.getElementById('edm-id').value = item.id;

        document.getElementById('edm-title').value = item.title;
        document.getElementById('edm-status').value = item.status;
        document.getElementById('edm-budget').value = item.budget;
        document.getElementById('edm-duration').value = item.duration;
        document.getElementById('edm-location').value = item.location;
        document.getElementById('edm-desc').value = item.description;

        const imgUrl = item.image || '';
        document.getElementById('edm-img-container').style.backgroundImage = `url('${imgUrl}')`;
        const imgInput = document.getElementById('edm-image-input');
        if (imgInput) imgInput.value = imgUrl;

        const mapUrlField = document.getElementById('edm-map-url');
        if (mapUrlField) mapUrlField.value = item.url;

        handleLocationInput(document.getElementById('edm-location'));
        detectDescriptionLink();

        const modal = document.getElementById('experience-detail-modal');
        if (modal) {
            modal.classList.add('open');
            modal.style.display = 'flex';
        } else {
            console.error('Experience Detail Modal not found in DOM');
        }
    }

    function detectDescriptionLink() {
        const descEl = document.getElementById('edm-desc');
        if (!descEl) return;
        const desc = descEl.value;

        const linkBtn = document.getElementById('edm-desc-link-btn');
        const linkText = document.getElementById('edm-desc-link-text');

        const urlRegex = new RegExp('(https?:\\/\\/[^\\s]+)', 'g');
        const match = desc.match(urlRegex);

        if (match && match.length > 0 && linkBtn) {
            const url = match[0];
            linkBtn.href = url;
            if (linkText) linkText.innerText = 'Go to: ' + new URL(url).hostname;
            linkBtn.style.display = 'flex';
        } else if (linkBtn) {
            linkBtn.style.display = 'none';
        }
    }

    function handleLocationInput(input) {
        if (!input) return;
        const val = input.value;
        const mapUrlField = document.getElementById('edm-map-url');
        const mapBtn = document.getElementById('edm-map-btn');

        if (val.includes('maps.google.com') || val.includes('goo.gl/maps') ||
            val.includes('google.com/maps')) {
            const placeRegex = new RegExp('\\/place\\/([^\\/]+)');
            const match = val.match(placeRegex);

            if (match && match[1]) {
                const name = decodeURIComponent(match[1].replace(new RegExp('\\+', 'g'), ' '));
                input.value = name;
            }

            if (mapUrlField) mapUrlField.value = val;
            if (mapBtn) mapBtn.style.display = 'inline-block';
        } else {
            if (mapUrlField) mapUrlField.value = '';
            if (mapBtn) mapBtn.style.display = val ? 'inline-block' : 'none';
        }
    }

    function openMap() {
        const mapUrl = document.getElementById('edm-map-url').value;
        const locationName = document.getElementById('edm-location').value;

        if (mapUrl) {
            window.open(mapUrl, '_blank');
        } else if (locationName) {
            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationName)}`, '_blank');
        }
    }

    function handleImageInput(input) {
        const val = input.value;
        if (!val) {
            document.getElementById('edm-img-container').style.backgroundImage = 'none';
            autoSaveExperience();
            return;
        }

        // Check if it looks like a share link or Drive link
        if (val.includes('photos.app.goo.gl') || val.includes('icloud.com/share') || val.includes('share.icloud.com') ||
            val.includes('gemini.google.com/share') || val.includes('drive.google.com')) {
            const statusLabel = document.getElementById('edm-save-status');
            if (statusLabel) statusLabel.innerText = 'Resolving Image...';

            google.script.run.withSuccessHandler(resolvedUrl => {
                if (resolvedUrl && resolvedUrl !== val) {
                    input.value = resolvedUrl;
                    document.getElementById('edm-img-container').style.backgroundImage = `url('${resolvedUrl}')`;
                    if (statusLabel) statusLabel.innerText = 'Resolved';
                } else {
                    // Fallback
                    document.getElementById('edm-img-container').style.backgroundImage = `url('${val}')`;
                }
                autoSaveExperience();
            }).withFailureHandler(e => {
                console.warn('Image Resolve Failed', e);
                document.getElementById('edm-img-container').style.backgroundImage = `url('${val}')`;
                autoSaveExperience();
            }).resolveImage(val);
        } else {
            // Standard URL
            document.getElementById('edm-img-container').style.backgroundImage = `url('${val}')`;
            autoSaveExperience();
        }
    }

    // --- Serialized AutoSave Logic ---
    let isExSaving = false;
    let isExSavePending = false;

    function autoSaveExperience() {
        if (isExSaving) {
            isExSavePending = true;
            return;
        }
        executeExperienceSave();
    }

    function executeExperienceSave() {
        const idObj = document.getElementById('edm-id');
        if (!idObj) return;

        const id = idObj.value;
        const title = document.getElementById('edm-title').value;

        if (!title) return;

        const status = document.getElementById('edm-status').value;
        const budget = document.getElementById('edm-budget').value;
        const duration = document.getElementById('edm-duration').value;
        const location = document.getElementById('edm-location').value;
        const description = document.getElementById('edm-desc').value;
        const urlObj = document.getElementById('edm-url');
        const url = urlObj ? urlObj.value : (document.getElementById('edm-map-url') ? document.getElementById('edm-map-url').value : '');
        const imageObj = document.getElementById('edm-image-input');
        const image = imageObj ? imageObj.value : '';

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

        isExSaving = true;
        isExSavePending = false;

        google.script.run.withSuccessHandler(res => {
            if (statusLabel) statusLabel.innerText = 'Saved';
            setTimeout(() => { if (statusLabel.innerText === 'Saved') statusLabel.innerText = ''; }, 2000);

            if (res && res.id) {
                if (!item.id || item.id === '') {
                    const currentIdElement = document.getElementById('edm-id');
                    if (currentIdElement) currentIdElement.value = res.id;
                    item.id = res.id;
                }
            }

            updateLocalExperience(item);
            isExSaving = false;

            if (isExSavePending) {
                executeExperienceSave();
            }
        }).withFailureHandler(e => {
            console.error(e);
            if (statusLabel) statusLabel.innerText = 'Error';
            isExSaving = false;
            if (isExSavePending) {
                setTimeout(executeExperienceSave, 1000);
            }
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

    console.log('Exposing Experience Detail Functions...');
    window.detectDescriptionLink = detectDescriptionLink;
    window.handleLocationInput = handleLocationInput;
    window.openMap = openMap;
    window.openExperienceDetail = openExperienceDetail;
    window.closeExperienceDetail = function () {
        const modal = document.getElementById('experience-detail-modal');
        if (modal) {
            modal.classList.remove('open');
            modal.style.display = 'none';
        }
        fetchExperiences();
    };
    window.autoSaveExperience = autoSaveExperience;

    console.log('Part 3_2 End - Full Restore (Projects + Exp Fetch + Exp Detail)');
